import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorText, type FormValue } from '@/api/http';
import { session } from '@/api/session';
import type { ConnectionMappingDetails } from '@/api/workflow';
import type { BlockNodeData, BlockProperties } from '@/types/workflow';
import Modal from '../ui/Modal';
import { FullPageError, InlineError, Spinner } from '../ui/feedback';
import FieldRenderer, { useSpreadsheetColumns } from './fields';
import { layoutFor, schemaFor, UNPORTED_BLOCKS } from './registry';
import { hydrate, isVisible, serialize } from './serialize';
import type { BlockLayout, BlockSchema, Values } from './schema';
import ConnectionMappingEditor, {
  type MappingRow,
  isSendmailMapping,
  mappingToPayload,
  mappingFromProperties,
  sendmailMappingToPayload,
} from './ConnectionMappingEditor';

/**
 * Properties the platform injects for display and re-derives on every save.
 * Echoing them back would persist presentation data into the workflow document.
 */
const TRANSIENT_KEYS = new Set(['block_type', 'obj_name', 'hidTb', 'objId', 'btn_click', 'btn_click_close']);

/**
 * `customblockPropInsert` **replaces** `block_properties` with whatever it
 * receives — it does not merge. Any key we fail to echo back is deleted from
 * the workflow. So the payload always starts from the stored properties and the
 * form overlays it; that also keeps blocks with an unported editor safe to open
 * and save.
 */
function buildPayload(
  stored: BlockProperties,
  formPayload: Record<string, FormValue>,
): Record<string, FormValue> {
  const base: Record<string, FormValue> = {};
  Object.entries(stored).forEach(([key, value]) => {
    if (TRANSIENT_KEYS.has(key)) return;
    base[key] = value as FormValue;
  });
  return { ...base, ...formPayload };
}

type Tab = 'settings' | 'mapping' | 'notes' | 'advanced';

export interface BlockSettingsDialogProps {
  workflowId: string;
  node: { id: string; data: BlockNodeData };
  /** Upstream block, when one is connected — enables the mapping tab. */
  incomingSourceId?: string;
  /** `properties` stored on the incoming connection. */
  incomingProperties?: Record<string, unknown>;
  readOnly: boolean;
  onClose: () => void;
  /** Fired after a successful save so the canvas can refresh the node. */
  onSaved: (patch: { label: string; description: string; block_properties: BlockProperties }) => void;
  notify: (text: string, kind?: 'info' | 'success' | 'error') => void;
}

export default function BlockSettingsDialog({
  workflowId,
  node,
  incomingSourceId,
  incomingProperties,
  readOnly,
  onClose,
  onSaved,
  notify,
}: BlockSettingsDialogProps) {
  const blockType = node.data.blockType;
  const schema = useMemo<BlockSchema | null>(() => schemaFor(blockType), [blockType]);
  const unportedNote = UNPORTED_BLOCKS[blockType];
  /** Which of the classic layout templates this block would have been rendered with. */
  const layout: BlockLayout = useMemo(() => layoutFor(blockType), [blockType]);

  const [tab, setTab] = useState<Tab>('settings');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const [stored, setStored] = useState<BlockProperties>({});
  const [values, setValues] = useState<Values>({});
  const [label, setLabel] = useState(node.data.label);
  const [description, setDescription] = useState(node.data.description);
  const [rawJson, setRawJson] = useState('{}');
  const [rawError, setRawError] = useState('');
  const [mapping, setMapping] = useState<MappingRow[]>([]);
  const [mappingDetails, setMappingDetails] = useState<ConnectionMappingDetails | null>(null);
  /**
   * The connection is only written when the mapping was actually put in front of
   * the user, or already carries values. Saving from the Settings tab alone must
   * not stamp an empty `field-mapping` onto a connection that had none.
   */
  const [mappingOpened, setMappingOpened] = useState(false);

  /* ---- load ---- */

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const props = (node.data.block_properties || {}) as BlockProperties;
      setStored(props);
      setValues(schema ? hydrate(schema, props) : {});
      setLabel(String(props.label || node.data.label || ''));
      setDescription(String(props.description || node.data.description || ''));
      setRawJson(JSON.stringify(stripTransient(props), null, 2));
      // `field-mapping` is written to both the connection and the target block,
      // but only the block's copy survives a save — Save.php drops connection
      // `properties` on the way to Mongo. Prefer the block, and keep the
      // connection as the fallback for a mapping still only in this session.
      const nodeProps = node.data.properties as Record<string, unknown> | undefined;
      const fromBlock = mappingFromProperties(nodeProps);
      const hasBlockMapping = fromBlock.some((r) => r.left || r.right);
      setMapping(hasBlockMapping ? fromBlock : mappingFromProperties(incomingProperties));
    } catch (e) {
      setLoadError(errorText(e, 'Could not read this block’s settings.'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, node.id, schema]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---- derived ---- */

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Filter/sort autocomplete follows whichever sheet the form points at.
  const sheetId = String(values.s_master_ssid || values.ssid || '');
  const columns = useSpreadsheetColumns(sheetId);

  /**
   * `tabbedBlockSettings.tpl` is the only layout with a tab strip, and it always
   * carries all three tabs. Advanced is ours: it is the only way to reach the
   * properties of a block whose editor is not ported, so it is offered exactly
   * for those blocks rather than for every one.
   */
  const canMap = layout === 'tabbed';
  const needsAdvanced = !schema || !!unportedNote;

  const tabs: Array<{ id: Tab; label: string }> = useMemo(() => {
    const list: Array<{ id: Tab; label: string }> = [];
    if (layout === 'tabbed') {
      list.push({ id: 'settings', label: 'Block Settings' });
      list.push({ id: 'mapping', label: 'Connection Mapping' });
      list.push({ id: 'notes', label: 'Notes' });
    }
    if (needsAdvanced) {
      if (list.length === 0) list.push({ id: 'settings', label: 'Block Settings' });
      list.push({ id: 'advanced', label: 'Advanced' });
    }
    return list;
  }, [layout, needsAdvanced]);

  // A layout switch must never strand the dialog on a tab that no longer exists.
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) setTab('settings');
  }, [tabs, tab]);

  useEffect(() => {
    if (tab === 'mapping') setMappingOpened(true);
  }, [tab]);

  /** Untabbed and plain layouts render everything on one page. */
  const singlePage = tabs.length === 0;
  const showSettings = singlePage || tab === 'settings';
  /**
   * `blockSettings.tpl` puts Description directly under Label; the tabbed
   * layout puts it after the block's own fields and repeats it on Notes. The
   * Date, Math and String layouts have no Description at all.
   */
  const descriptionPlacement: 'none' | 'top' | 'bottom' =
    layout === 'plain' ? 'none' : layout === 'untabbed' ? 'top' : 'bottom';

  /* ---- save ---- */

  const save = useCallback(
    async (close: boolean) => {
      if (readOnly) return;
      setSaving(true);
      setSaveError('');

      try {
        let formPayload: Record<string, FormValue>;

        if (tab === 'advanced') {
          // Advanced posts the edited document verbatim, which is what makes
          // blocks without a ported editor fully serviceable here.
          let parsed: unknown;
          try {
            parsed = JSON.parse(rawJson);
          } catch {
            setRawError('That is not valid JSON.');
            setSaving(false);
            return;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setRawError('Properties must be a JSON object.');
            setSaving(false);
            return;
          }
          setRawError('');
          formPayload = parsed as Record<string, FormValue>;
        } else {
          formPayload = schema ? serialize(schema, values) : {};
        }

        formPayload.label = label;
        formPayload.description = description;
        formPayload.blockType = blockType;

        const finalPayload = buildPayload(tab === 'advanced' ? {} : stored, formPayload);

        await session.saveBlockProperties(
          workflowId,
          node.id,
          blockType,
          finalPayload,
        );

        const hasMapping = mapping.some((r) => r.left || r.right);
        if (canMap && incomingSourceId && (mappingOpened || hasMapping)) {
          // Send Mail always writes its full fixed row set, so clearing a field
          // in the dialog actually clears it on the connection.
          const sendmail = isSendmailMapping(mappingDetails) || blockType === 'sendmail';
          await session.saveConnectionProperties(
            workflowId,
            incomingSourceId,
            node.id,
            sendmail ? 'SENDMAIL' : 'READ',
            sendmail ? sendmailMappingToPayload(mapping) : mappingToPayload(mapping),
          );
        }

        onSaved({ label, description, block_properties: finalPayload });
        notify('Block settings saved.', 'success');

        if (close) {
          onClose();
        } else {
          setStored(finalPayload);
          setRawJson(JSON.stringify(stripTransient(finalPayload), null, 2));
        }
      } catch (e) {
        setSaveError(errorText(e, 'Could not save the block settings.'));
      } finally {
        setSaving(false);
      }
    },
    [
      blockType,
      canMap,
      description,
      incomingSourceId,
      label,
      mapping,
      mappingDetails,
      mappingOpened,
      node.id,
      notify,
      onClose,
      onSaved,
      rawJson,
      readOnly,
      schema,
      stored,
      tab,
      values,
      workflowId,
    ],
  );

  /* ---- render ---- */

  const footer = (
    <>
      <button type="button" className="viz-btn" onClick={onClose}>
        {readOnly ? 'Close' : 'Cancel'}
      </button>
      {!readOnly ? (
        <>
          <button type="button" className="viz-btn" onClick={() => void save(false)} disabled={saving || loading}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="viz-btn is-primary"
            onClick={() => void save(true)}
            disabled={saving || loading}
          >
            Save and Close
          </button>
        </>
      ) : null}
    </>
  );

  const labelRow = (
    <div className="viz-field-grid">
      <div className="viz-field">
        <label className="viz-field-label" htmlFor="viz-block-label">
          Label
        </label>
        <div className="viz-field-control">
          <input
            id="viz-block-label"
            className="viz-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  const descriptionRow = (
    <div className="viz-field is-full">
      <label className="viz-field-label" htmlFor="viz-block-desc">
        Description
      </label>
      <div className="viz-field-control">
        <textarea
          id="viz-block-desc"
          className="viz-textarea"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this block does, and anything the next person should know."
        />
      </div>
    </div>
  );

  return (
    <Modal
      title={schema?.title || node.data.displayName || blockType}
      size={schema && schema.groups.length > 1 ? 'lg' : 'md'}
      onClose={onClose}
      busy={saving}
      banner={saveError ? <InlineError>{saveError}</InlineError> : null}
      footer={footer}
    >
      {loading ? (
        <div className="viz-modal-loading">
          <Spinner label="Loading settings…" />
        </div>
      ) : loadError ? (
        <FullPageError
          title="Could not load settings"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : (
        <>
          {tabs.length ? (
            <div className="viz-tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={`viz-tab${tab === t.id ? ' is-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="viz-tabpanel" role="tabpanel">
            {showSettings ? (
              <fieldset className="viz-form" disabled={readOnly}>
                {labelRow}
                {descriptionPlacement === 'top' ? descriptionRow : null}

                {!schema || unportedNote ? (
                  <p className="viz-field-note">
                    Edit this block on the Advanced tab.
                  </p>
                ) : null}

                {schema?.groups.map((grp, index) => {
                  const visible = grp.fields.filter((f) => isVisible(f, values));
                  if (!visible.length) return null;
                  return (
                    // Groups are static per schema.
                    // eslint-disable-next-line react/no-array-index-key
                    <section className="viz-field-group" key={grp.title || index}>
                      {grp.title ? <h3>{grp.title}</h3> : null}
                      <div className="viz-field-grid">
                        {visible.map((field) => (
                          <FieldRenderer
                            key={field.name}
                            field={field}
                            values={values}
                            onChange={setValue}
                            columns={columns}
                            readOnly={readOnly}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}

                {descriptionPlacement === 'bottom' ? descriptionRow : null}
              </fieldset>
            ) : null}

            {tab === 'mapping' && !singlePage ? (
              incomingSourceId ? (
                <ConnectionMappingEditor
                  rows={mapping}
                  onChange={setMapping}
                  readOnly={readOnly}
                  workflowId={workflowId}
                  sourceId={incomingSourceId}
                  targetId={node.id}
                  onDetails={setMappingDetails}
                />
              ) : (
                <p className="viz-field-note" style={{ margin: '1rem' }}>
                  Connect an incoming block to map fields.
                </p>
              )
            ) : null}

            {tab === 'notes' && !singlePage ? (
              <fieldset className="viz-form" disabled={readOnly}>
                {descriptionRow}
              </fieldset>
            ) : null}

            {tab === 'advanced' && !singlePage ? (
              <fieldset className="viz-form" disabled={readOnly}>
                <textarea
                  className="viz-textarea is-mono is-tall"
                  spellCheck={false}
                  value={rawJson}
                  onChange={(e) => {
                    setRawJson(e.target.value);
                    setRawError('');
                  }}
                  aria-label="Raw block properties"
                />
                {rawError ? <InlineError>{rawError}</InlineError> : null}
              </fieldset>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  );
}

function stripTransient(props: BlockProperties): BlockProperties {
  const out: BlockProperties = {};
  Object.entries(props).forEach(([key, value]) => {
    if (!TRANSIENT_KEYS.has(key)) out[key] = value;
  });
  return out;
}
