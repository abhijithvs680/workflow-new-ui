/**
 * Agent Node → Capabilities → Skills.
 *
 * The classic dialog put a multi-select over the skills, a row of chips under
 * it, and opened a second modal when a chip was clicked. The same three moves
 * are here — enable, see whether it is configured, open its settings — as one
 * card per skill, which is the vocabulary the rest of this app already uses.
 *
 * Each skill's settings are stored as a JSON string under its own block
 * property; this component only ever edits those strings. See `skills.ts` for
 * the field definitions and `AgentNodeSkills.php` for what reads them.
 */
import { useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import WorkflowPicker from '../ui/WorkflowPicker';
import { InlineError } from '../ui/feedback';
import { PlusIcon, TrashIcon } from '../ui/icons';
import type { SkillsValue } from './schema';
import {
  blankWorkflowTool,
  isSkillConfigured,
  isSkillFieldVisible,
  parseSkillConfig,
  skillFieldValue,
  SKILLS,
  SKILL_BY_ID,
  WORKFLOW_PARAM_TYPES,
  WORKFLOW_PURPOSES,
  WORKFLOW_RESULT_MODES,
  type SkillConfig,
  type SkillDef,
  type SkillField,
  type SkillId,
  type WorkflowParam,
  type WorkflowTool,
} from './skills';

export interface SkillsEditorProps {
  value: SkillsValue;
  onChange: (next: SkillsValue) => void;
  readOnly?: boolean;
}

export default function SkillsEditor({ value, onChange, readOnly }: SkillsEditorProps) {
  const [editing, setEditing] = useState<SkillId | null>(null);

  const selected = value.selected || [];
  const configs = value.configs || {};

  const toggle = (id: SkillId, on: boolean) => {
    const next = on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id);
    onChange({ selected: next, configs });
    // Enabling a skill with nothing configured is a dead end, so go straight to
    // its settings the way clicking a fresh chip used to.
    if (on && !isSkillConfigured(id, configs[id] || '')) setEditing(id);
  };

  const saveConfig = (id: SkillId, json: string) => {
    onChange({
      // Configuring a skill implies wanting it on.
      selected: selected.includes(id) ? selected : [...selected, id],
      configs: { ...configs, [id]: json },
    });
  };

  return (
    <div className="viz-skills">
      {SKILLS.map((skill) => {
        const on = selected.includes(skill.id);
        const configured = isSkillConfigured(skill.id, configs[skill.id] || '');
        return (
          <div className={`viz-skill-card${on ? ' is-on' : ''}`} key={skill.id}>
            <label className="viz-checkbox viz-skill-toggle">
              <input
                type="checkbox"
                checked={on}
                disabled={readOnly}
                onChange={(e) => toggle(skill.id, e.target.checked)}
              />
              <span>{skill.label}</span>
            </label>

            <p className="viz-skill-blurb">{skill.blurb}</p>

            <div className="viz-skill-foot">
              <span className={`viz-skill-state${configured ? ' is-ready' : ''}`}>
                {configured ? 'Configured' : 'Not configured'}
              </span>
              <button type="button" className="viz-link-btn" onClick={() => setEditing(skill.id)}>
                Configure
              </button>
            </div>
          </div>
        );
      })}

      {editing ? (
        <SkillConfigDialog
          skill={SKILL_BY_ID[editing]}
          json={configs[editing] || ''}
          readOnly={readOnly}
          onClose={() => setEditing(null)}
          onSave={(json) => {
            saveConfig(editing, json);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Configuration dialog                                                       */
/* -------------------------------------------------------------------------- */

function SkillConfigDialog({
  skill,
  json,
  readOnly,
  onClose,
  onSave,
}: {
  skill: SkillDef;
  json: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (json: string) => void;
}) {
  const stored = useMemo(() => parseSkillConfig(json), [json]);
  const [errors, setErrors] = useState<string[]>([]);

  const [fieldValues, setFieldValues] = useState<Record<string, string | boolean>>(() => {
    const initial: Record<string, string | boolean> = {};
    (skill.fields || []).forEach((f) => {
      initial[f.key] = skillFieldValue(f, stored);
    });
    return initial;
  });

  const [workflows, setWorkflows] = useState<WorkflowTool[]>(() => readWorkflowTools(stored));

  const save = () => {
    if (skill.renderer === 'workflow') {
      const problems = validateWorkflows(workflows);
      if (problems.length) {
        setErrors(problems);
        return;
      }
      onSave(JSON.stringify({ workflows: workflows.filter((w) => w.shortcode.trim() !== '') }));
      return;
    }

    const missing = (skill.fields || [])
      .filter((f) => f.required && isSkillFieldVisible(f, fieldValues))
      .filter((f) => String(fieldValues[f.key] ?? '').trim() === '')
      .map((f) => `${f.label} is required.`);
    if (missing.length) {
      setErrors(missing);
      return;
    }

    // Every declared key is written, so clearing a box in the dialog actually
    // clears it in the stored config.
    const out: SkillConfig = {};
    (skill.fields || []).forEach((f) => {
      out[f.key] = f.type === 'checkbox' ? !!fieldValues[f.key] : String(fieldValues[f.key] ?? '').trim();
    });
    onSave(JSON.stringify(out));
  };

  return (
    <Modal
      title={`${skill.label} skill`}
      subtitle={skill.hint}
      size={skill.renderer === 'workflow' ? 'lg' : 'md'}
      onClose={onClose}
      banner={errors.length ? <InlineError>{errors.join(' ')}</InlineError> : null}
      footer={
        <>
          <button type="button" className="viz-btn" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly ? (
            <button type="button" className="viz-btn is-primary" onClick={save}>
              Save and Close
            </button>
          ) : null}
        </>
      }
    >
      <fieldset className="viz-form" disabled={readOnly}>
        {skill.renderer === 'workflow' ? (
          <WorkflowSkillEditor tools={workflows} onChange={setWorkflows} />
        ) : (
          <div className="viz-field-grid">
            {(skill.fields || [])
              .filter((f) => isSkillFieldVisible(f, fieldValues))
              .map((field) => (
                <SkillFieldRow
                  key={field.key}
                  field={field}
                  value={fieldValues[field.key]}
                  onChange={(next) => setFieldValues((prev) => ({ ...prev, [field.key]: next }))}
                />
              ))}
          </div>
        )}
      </fieldset>
    </Modal>
  );
}

function SkillFieldRow({
  field,
  value,
  onChange,
}: {
  field: SkillField;
  value: string | boolean | undefined;
  onChange: (next: string | boolean) => void;
}) {
  const id = `viz-skill-${field.key}`;

  if (field.type === 'checkbox') {
    return (
      <div className="viz-field is-half">
        <span className="viz-field-label" />
        <div className="viz-field-control">
          <label className="viz-checkbox">
            <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span>{field.label}</span>
          </label>
          {field.help ? <p className="viz-field-help">{field.help}</p> : null}
        </div>
      </div>
    );
  }

  const text = String(value ?? '');

  return (
    <div className="viz-field is-half">
      <label className="viz-field-label" htmlFor={id}>
        {field.label}
        {field.required ? <abbr title="Required">*</abbr> : null}
      </label>
      <div className="viz-field-control">
        {field.type === 'select' ? (
          <Select id={id} value={text} options={field.options || []} onChange={onChange} />
        ) : field.type === 'textarea' ? (
          <textarea
            id={id}
            className="viz-textarea"
            rows={3}
            placeholder={field.placeholder}
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <SecretInput
            id={id}
            secret={field.type === 'password'}
            placeholder={field.placeholder}
            value={text}
            onChange={onChange}
          />
        )}
        {field.help ? <p className="viz-field-help">{field.help}</p> : null}
      </div>
    </div>
  );
}

/** Text box that starts masked, with a reveal toggle for checking a pasted key. */
export function SecretInput({
  id,
  secret,
  value,
  placeholder,
  onChange,
}: {
  id?: string;
  secret?: boolean;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!secret) {
    return (
      <input
        id={id}
        className="viz-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="viz-secret">
      <input
        id={id}
        className="viz-input"
        type={revealed ? 'text' : 'password'}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="viz-link-btn"
        onClick={() => setRevealed((v) => !v)}
        title={revealed ? 'Hide' : 'Show'}
      >
        {revealed ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Workflow skill                                                             */
/* -------------------------------------------------------------------------- */

function readWorkflowTools(cfg: SkillConfig): WorkflowTool[] {
  const raw = Array.isArray(cfg.workflows) ? cfg.workflows : [];
  return raw.map((entry) => {
    const row = (entry || {}) as Record<string, unknown>;
    const params = Array.isArray(row.params) ? row.params : [];
    return {
      ...blankWorkflowTool(),
      shortcode: String(row.shortcode ?? ''),
      name: String(row.name ?? ''),
      tool_name: String(row.tool_name ?? ''),
      purpose: String(row.purpose ?? 'action'),
      description: String(row.description ?? ''),
      static_inputs: String(row.static_inputs ?? ''),
      result_mode: String(row.result_mode ?? 'full'),
      is_sub_agent: row.is_sub_agent === true || row.is_sub_agent === 'true',
      sub_agent_id: String(row.sub_agent_id ?? ''),
      params: params.map((p) => {
        const param = (p || {}) as Record<string, unknown>;
        return {
          name: String(param.name ?? ''),
          type: String(param.type ?? 'string'),
          description: String(param.description ?? ''),
          required: param.required === true || param.required === 'true',
        } as WorkflowParam;
      }),
    };
  });
}

function validateWorkflows(tools: WorkflowTool[]): string[] {
  const problems: string[] = [];
  const seenSubAgentIds = new Set<string>();

  if (!tools.length) problems.push('Add at least one workflow.');

  tools.forEach((tool, i) => {
    if (!tool.shortcode.trim()) problems.push(`Workflow ${i + 1}: choose a workflow.`);

    if (tool.static_inputs.trim()) {
      try {
        JSON.parse(tool.static_inputs);
      } catch {
        problems.push(`Workflow ${i + 1}: fixed inputs must be valid JSON.`);
      }
    }

    // Two sub-agents sharing an id are indistinguishable in the streaming UI.
    if (tool.is_sub_agent && tool.sub_agent_id.trim()) {
      const id = tool.sub_agent_id.trim();
      if (seenSubAgentIds.has(id)) problems.push(`Sub-agent ID "${id}" is used more than once.`);
      seenSubAgentIds.add(id);
    }
  });

  return problems;
}

function WorkflowSkillEditor({
  tools,
  onChange,
}: {
  tools: WorkflowTool[];
  onChange: (next: WorkflowTool[]) => void;
}) {
  const update = (i: number, patch: Partial<WorkflowTool>) =>
    onChange(tools.map((tool, j) => (j === i ? { ...tool, ...patch } : tool)));

  return (
    <div className="viz-wf-tools">
      {tools.map((tool, i) => (
        // Cards are positional; a workflow can legitimately appear twice.
        // eslint-disable-next-line react/no-array-index-key
        <section className="viz-wf-card" key={i}>
          <header className="viz-wf-card-head">
            <b>{tool.name || tool.shortcode || `Workflow ${i + 1}`}</b>
            <button
              type="button"
              className="viz-icon-btn"
              title="Remove workflow"
              aria-label="Remove workflow"
              onClick={() => onChange(tools.filter((_, j) => j !== i))}
            >
              <TrashIcon size={13} />
            </button>
          </header>

          <div className="viz-field-grid">
            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-sc`}>
                Workflow<abbr title="Required">*</abbr>
              </label>
              <div className="viz-field-control">
                <WorkflowPicker
                  id={`viz-wf-${i}-sc`}
                  value={tool.shortcode}
                  label={tool.name}
                  onChange={(shortcode, label) => update(i, { shortcode, name: label })}
                />
              </div>
            </div>

            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-purpose`}>
                What is this workflow for?<abbr title="Required">*</abbr>
              </label>
              <div className="viz-field-control">
                <Select
                  id={`viz-wf-${i}-purpose`}
                  value={tool.purpose}
                  options={WORKFLOW_PURPOSES}
                  onChange={(purpose) => update(i, { purpose })}
                />
                <p className="viz-field-help">
                  Shapes the tool description so the agent knows when to reach for it.
                </p>
              </div>
            </div>

            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-desc`}>
                Description for the agent
              </label>
              <div className="viz-field-control">
                <textarea
                  id={`viz-wf-${i}-desc`}
                  className="viz-textarea"
                  rows={3}
                  placeholder="e.g. Creates a sales order and returns the order number. Use it only after the customer has confirmed the items."
                  value={tool.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>
            </div>

            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-tool`}>
                Tool name
              </label>
              <div className="viz-field-control">
                <input
                  id={`viz-wf-${i}-tool`}
                  className="viz-input"
                  placeholder="create_order"
                  value={tool.tool_name}
                  onChange={(e) => update(i, { tool_name: e.target.value })}
                />
                <p className="viz-field-help">
                  Letters, digits and underscores. Defaults to run_&lt;shortcode&gt;.
                </p>
              </div>
            </div>
          </div>

          <h4 className="viz-wf-subhead">Inputs the agent supplies</h4>
          <ParamsRowset params={tool.params} onChange={(params) => update(i, { params })} />
          <p className="viz-field-help">
            Leave empty to let the agent pass a free-form JSON object instead.
          </p>

          <div className="viz-field-grid viz-wf-tail">
            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-static`}>
                Fixed inputs (JSON)
              </label>
              <div className="viz-field-control">
                <textarea
                  id={`viz-wf-${i}-static`}
                  className="viz-textarea is-mono"
                  rows={3}
                  spellCheck={false}
                  placeholder={'{"source":"agent"}'}
                  value={tool.static_inputs}
                  onChange={(e) => update(i, { static_inputs: e.target.value })}
                />
                <p className="viz-field-help">
                  Merged into every call. Supports {'{variable}'} references to earlier blocks.
                </p>
              </div>
            </div>

            <div className="viz-field is-full">
              <label className="viz-field-label" htmlFor={`viz-wf-${i}-mode`}>
                Return to the agent
              </label>
              <div className="viz-field-control">
                <Select
                  id={`viz-wf-${i}-mode`}
                  value={tool.result_mode}
                  options={WORKFLOW_RESULT_MODES}
                  onChange={(result_mode) => update(i, { result_mode })}
                />
              </div>
            </div>
          </div>

          <h4 className="viz-wf-subhead">Sub-agent</h4>
          <div className="viz-field-grid">
            <div className="viz-field is-full">
              <span className="viz-field-label" />
              <div className="viz-field-control">
                <label className="viz-checkbox">
                  <input
                    type="checkbox"
                    checked={tool.is_sub_agent}
                    onChange={(e) => update(i, { is_sub_agent: e.target.checked })}
                  />
                  <span>This workflow is a sub-agent</span>
                </label>
                <p className="viz-field-help">
                  Passes this agent’s streaming target and the sub-agent ID into the workflow, so an Agent Node
                  inside it can stream back to the same UI and be identified.
                </p>
              </div>
            </div>

            {tool.is_sub_agent ? (
              <div className="viz-field is-full">
                <label className="viz-field-label" htmlFor={`viz-wf-${i}-sub`}>
                  Unique sub-agent ID
                </label>
                <div className="viz-field-control">
                  <input
                    id={`viz-wf-${i}-sub`}
                    className="viz-input"
                    placeholder="research_agent"
                    value={tool.sub_agent_id}
                    onChange={(e) => update(i, { sub_agent_id: e.target.value })}
                  />
                  <p className="viz-field-help">
                    Sent to the child workflow as sub_agent_id and echoed in every stream frame it emits.
                    Defaults to the tool name.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ))}

      <button type="button" className="viz-btn is-outline is-sm" onClick={() => onChange([...tools, blankWorkflowTool()])}>
        <PlusIcon size={12} /> Add workflow
      </button>
    </div>
  );
}

function ParamsRowset({
  params,
  onChange,
}: {
  params: WorkflowParam[];
  onChange: (next: WorkflowParam[]) => void;
}) {
  const update = (i: number, patch: Partial<WorkflowParam>) =>
    onChange(params.map((row, j) => (j === i ? { ...row, ...patch } : row)));

  return (
    <div className="viz-rowset">
      {params.length ? (
        <div className="viz-rowset-head viz-wf-params-grid">
          <span>Input name</span>
          <span>Type</span>
          <span>What should the agent put here?</span>
          <span>Req</span>
          <span />
        </div>
      ) : null}

      {params.map((param, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div className="viz-rowset-row viz-wf-params-grid" key={i}>
          <input
            className="viz-input"
            aria-label={`Input ${i + 1} name`}
            placeholder="input name"
            value={param.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Select
            aria-label={`Input ${i + 1} type`}
            value={param.type}
            options={WORKFLOW_PARAM_TYPES}
            onChange={(type) => update(i, { type })}
          />
          <input
            className="viz-input"
            aria-label={`Input ${i + 1} description`}
            value={param.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <label className="viz-checkbox">
            <input
              type="checkbox"
              aria-label={`Input ${i + 1} required`}
              checked={param.required}
              onChange={(e) => update(i, { required: e.target.checked })}
            />
          </label>
          <button
            type="button"
            className="viz-icon-btn"
            title="Remove input"
            aria-label="Remove input"
            onClick={() => onChange(params.filter((_, j) => j !== i))}
          >
            <TrashIcon size={13} />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="viz-link-btn"
        onClick={() => onChange([...params, { name: '', type: 'string', description: '', required: false }])}
      >
        <PlusIcon size={12} /> Add input
      </button>
    </div>
  );
}
