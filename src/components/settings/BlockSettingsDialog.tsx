import { useCallback, useEffect, useMemo, useState } from 'react';
import { errorText, type FormValue } from '@/api/http';
import { session } from '@/api/session';
import { fetchBlockProperties } from '@/api/workflow';
import type { BlockNodeData, BlockProperties } from '@/types/workflow';
import Modal from '../ui/Modal';
import { FullPageError, InlineError, Spinner } from '../ui/feedback';
import FieldRenderer, { useSpreadsheetColumns } from './fields';
import { schemaFor, UNPORTED_BLOCKS } from './registry';
import { hydrate, isVisible, serialize } from './serialize';
import type { BlockSchema, Values } from './schema';
import ConnectionMappingEditor, { type MappingRow, mappingToPayload, mappingFromProperties } from './ConnectionMappingEditor';

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
  onSaved: (patch: { label: string; description: string }) => void;
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

  /* ---- load ---- */

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const props = await fetchBlockProperties(workflowId, node.id);
      setStored(props);
      setValues(schema ? hydrate(schema, props) : {});
      setLabel(String(props.label || node.data.label || ''));
      setDescription(String(props.description || node.data.description || ''));
      setRawJson(JSON.stringify(stripTransient(props), null, 2));
      setMapping(mappingFromProperties(incomingProperties));
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

  const canMap = !!schema?.connectionMapping && !!incomingSourceId;
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'settings', label: 'Settings' },
    ...(canMap ? ([{ id: 'mapping', label: 'Connection mapping' }] as const) : []),
    { id: 'notes', label: 'Notes' },
    { id: 'advanced', label: 'Advanced' },
  ];

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

        await session.saveBlockProperties(
          workflowId,
          node.id,
          blockType,
          buildPayload(tab === 'advanced' ? {} : stored, formPayload),
        );

        if (canMap && incomingSourceId && mapping.some((r) => r.left || r.right)) {
          await session.saveConnectionProperties(
            workflowId,
            incomingSourceId,
            node.id,
            blockType === 'sendmail' ? 'SENDMAIL' : 'READ',
            mappingToPayload(mapping),
          );
        }

        onSaved({ label, description });
        notify('Block settings saved.', 'success');
        if (close) onClose();
        else void load();
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
      load,
      mapping,
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
      <span className="viz-modal-foot-note">
        {readOnly ? 'Read-only — click Edit on the toolbar to make changes.' : `Block ${node.id}`}
      </span>
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
            Save and close
          </button>
        </>
      ) : null}
    </>
  );

  return (
    <Modal
      title={schema?.title || node.data.displayName || blockType}
      subtitle={schema?.summary}
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

          <div className="viz-tabpanel" role="tabpanel">
            {tab === 'settings' ? (
              <fieldset className="viz-form" disabled={readOnly}>
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
                      <p className="viz-field-help">
                        Other blocks reference this block’s output as{' '}
                        <code>{`{${label || 'label'}.field}`}</code>.
                      </p>
                    </div>
                  </div>
                </div>

                {!schema ? (
                  <p className="viz-field-note">
                    No dedicated editor exists for <code>{blockType}</code>. Use the Advanced tab to edit its
                    properties directly.
                  </p>
                ) : null}

                {unportedNote ? (
                  <p className="viz-field-note is-warning">
                    {unportedNote} Its properties remain editable on the Advanced tab, and are preserved
                    untouched when you save from here.
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
                      {grp.description ? <p className="viz-field-group-desc">{grp.description}</p> : null}
                      <div className="viz-field-grid">
                        {visible.map((field) => (
                          <FieldRenderer
                            key={field.name}
                            field={field}
                            values={values}
                            onChange={setValue}
                            columns={columns}
                          />
                        ))}
                      </div>
                    </section>
                  );
                })}
              </fieldset>
            ) : null}

            {tab === 'mapping' && incomingSourceId ? (
              <ConnectionMappingEditor
                rows={mapping}
                onChange={setMapping}
                readOnly={readOnly}
                sourceId={incomingSourceId}
                targetId={node.id}
              />
            ) : null}

            {tab === 'notes' ? (
              <fieldset className="viz-form" disabled={readOnly}>
                <div className="viz-field is-full">
                  <label className="viz-field-label" htmlFor="viz-block-desc">
                    Description
                  </label>
                  <div className="viz-field-control">
                    <textarea
                      id="viz-block-desc"
                      className="viz-textarea"
                      rows={8}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What this block does, and anything the next person should know."
                    />
                    <p className="viz-field-help">Shown as a tooltip on the canvas.</p>
                  </div>
                </div>
              </fieldset>
            ) : null}

            {tab === 'advanced' ? (
              <fieldset className="viz-form" disabled={readOnly}>
                <p className="viz-field-note">
                  Raw <code>block_properties</code> for this block. Saving from this tab replaces the stored
                  document with exactly what is below.
                </p>
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
