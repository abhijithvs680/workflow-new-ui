/**
 * Agent Node skills — the pre-packaged integrations the block can expose to the
 * model as tools.
 *
 * Everything here is a wire contract with `AgentNodeSkills.php`:
 *
 *  - `SKILL_CONFIG_KEYS` names the flat block property each skill's JSON is
 *    stored in. The PHP side reads exactly these keys.
 *  - Every `SkillField.key` is a key inside that JSON, read by the matching
 *    `*SkillTools()` / `*Send()` pair.
 *  - The enabled set is posted as the comma-separated `skills` property.
 *
 * The field lists mirror the classic `agentNodeBlock.tpl` skill modal one for
 * one — same order, same labels, same defaults — so a block configured in
 * either editor round-trips through the other unchanged.
 */
import type { Option } from '@/api/lookups';

export type SkillId = 'workflow' | 'slack' | 'telegram' | 'discord' | 'whatsapp' | 'email';

export const SKILL_CONFIG_KEYS: Record<SkillId, string> = {
  workflow: 'skill_workflow_config',
  slack: 'skill_slack_config',
  telegram: 'skill_telegram_config',
  discord: 'skill_discord_config',
  whatsapp: 'skill_whatsapp_config',
  email: 'skill_email_config',
};

export interface SkillField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'textarea' | 'select' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Value used when the stored config has no entry for this key. */
  def?: string | boolean;
  options?: Option[];
  /** Show only while every listed sibling field holds the given value. */
  showIf?: Record<string, string>;
}

export interface SkillDef {
  id: SkillId;
  label: string;
  /** One line on the skill card, from the classic multi-select option text. */
  blurb: string;
  /** Setup guidance shown at the top of the configuration dialog. */
  hint: string;
  fields?: SkillField[];
  /** Skills whose editor is not a flat field list. */
  renderer?: 'workflow';
}

function opts(...pairs: Array<[string, string]>): Option[] {
  return pairs.map(([value, label]) => ({ value, label }));
}

export const SKILLS: SkillDef[] = [
  {
    id: 'workflow',
    label: 'Workflow',
    blurb: 'Call other Vizru workflows',
    hint:
      'Expose other Vizru workflows to the agent as callable tools. Configure each workflow tool, its inputs, ' +
      'return mode, and optional sub-agent routing.',
    renderer: 'workflow',
  },
  {
    id: 'slack',
    label: 'Slack',
    blurb: 'Post and read team messages',
    hint:
      'Create a Slack app, add the chat:write scope, install it to the workspace and invite the bot to the ' +
      'channel it should post in.',
    fields: [
      {
        key: 'bot_token',
        label: 'Bot User OAuth Token',
        type: 'password',
        required: true,
        help: 'Starts with xoxb-. Found under OAuth & Permissions.',
      },
      {
        key: 'default_channel',
        label: 'Default channel',
        type: 'text',
        placeholder: '#alerts or C01ABCDEFG',
        help: 'Used whenever the agent does not name a channel.',
      },
      { key: 'allow_channel_override', label: 'Let the agent choose the channel', type: 'checkbox', def: true },
      { key: 'username', label: 'Override bot display name', type: 'text', placeholder: 'Vizru Agent' },
      { key: 'icon_emoji', label: 'Override bot icon', type: 'text', placeholder: ':robot_face:' },
      { key: 'unfurl_links', label: 'Expand link previews', type: 'checkbox', def: true },
      {
        key: 'enable_read',
        label: 'Allow reading channel history',
        type: 'checkbox',
        help: 'Adds slack_read_messages. Requires the channels:history scope.',
      },
      {
        key: 'enable_list_channels',
        label: 'Allow listing channels',
        type: 'checkbox',
        help: 'Adds slack_list_channels. Requires the channels:read scope.',
      },
    ],
  },
  {
    id: 'telegram',
    label: 'Telegram',
    blurb: 'Direct message a chat or channel',
    hint:
      'Create a bot with @BotFather to get a token. To find your chat ID, message the bot once and open ' +
      'https://api.telegram.org/bot<token>/getUpdates.',
    fields: [
      { key: 'bot_token', label: 'Bot token', type: 'password', required: true, placeholder: '123456789:AA...' },
      {
        key: 'chat_id',
        label: 'Chat ID',
        type: 'text',
        required: true,
        placeholder: '123456789 or @mychannel',
        help: 'Your personal chat, a group, or a channel the bot administers.',
      },
      { key: 'allow_chat_override', label: 'Let the agent choose the chat', type: 'checkbox', def: false },
      {
        key: 'parse_mode',
        label: 'Formatting',
        type: 'select',
        def: 'HTML',
        options: opts(['HTML', 'HTML'], ['MarkdownV2', 'MarkdownV2'], ['none', 'Plain text']),
        help: 'HTML is the most forgiving. MarkdownV2 needs strict escaping.',
      },
      { key: 'disable_notification', label: 'Send silently (no push notification)', type: 'checkbox' },
      {
        key: 'enable_send_document',
        label: 'Allow sending documents by URL',
        type: 'checkbox',
        help: 'Adds telegram_send_document.',
      },
    ],
  },
  {
    id: 'discord',
    label: 'Discord Webhooks',
    blurb: 'Push rich embed cards',
    hint:
      'In Discord open Channel Settings > Integrations > Webhooks and copy the webhook URL. No bot or OAuth ' +
      'app is needed.',
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'password',
        required: true,
        placeholder: 'https://discord.com/api/webhooks/...',
      },
      { key: 'username', label: 'Override webhook name', type: 'text', placeholder: 'Vizru Agent' },
      { key: 'avatar_url', label: 'Override avatar URL', type: 'text' },
      {
        key: 'default_color',
        label: 'Default accent colour',
        type: 'text',
        def: '#5865F2',
        placeholder: '#5865F2',
        help: 'Hex colour used when the agent does not pick one.',
      },
      {
        key: 'mention',
        label: 'Always prepend mention',
        type: 'text',
        placeholder: '<@&123456789> or @here',
        help: 'Optional. Pings a role or channel on every card.',
      },
      {
        key: 'thread_id',
        label: 'Post into thread ID',
        type: 'text',
        help: 'Optional. Leave blank to post in the channel itself.',
      },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp Business',
    blurb: 'Customer messaging',
    hint:
      'Uses the WhatsApp Cloud API. You need a Meta app with WhatsApp added, a phone number ID and a permanent ' +
      'system-user access token. Free-form replies are only allowed within 24 hours of the customer’s last message.',
    fields: [
      {
        key: 'phone_number_id',
        label: 'Phone number ID',
        type: 'text',
        required: true,
        help: 'From Meta for Developers > WhatsApp > API Setup.',
      },
      {
        key: 'access_token',
        label: 'Access token',
        type: 'password',
        required: true,
        help: 'Use a permanent system-user token; temporary tokens expire in 24 hours.',
      },
      { key: 'api_version', label: 'Graph API version', type: 'text', def: 'v23.0', placeholder: 'v23.0' },
      {
        key: 'default_to',
        label: 'Default recipient',
        type: 'text',
        placeholder: '919876543210',
        help: 'International format, digits only, no + or spaces.',
      },
      { key: 'allow_recipient_override', label: 'Let the agent choose the recipient', type: 'checkbox', def: true },
      {
        key: 'enable_template',
        label: 'Allow sending approved templates',
        type: 'checkbox',
        help: 'Required to reach customers outside the 24-hour window.',
      },
      { key: 'template_name', label: 'Default template name', type: 'text', placeholder: 'order_update' },
      { key: 'template_language', label: 'Template language code', type: 'text', def: 'en_US', placeholder: 'en_US' },
    ],
  },
  {
    id: 'email',
    label: 'Email',
    blurb: 'SendGrid or SMTP — send HTML reports',
    hint:
      'Sends HTML email through SendGrid or any SMTP server. Verify your sender domain first or messages will ' +
      'land in spam.',
    fields: [
      {
        key: 'provider',
        label: 'Transport',
        type: 'select',
        def: 'sendgrid',
        options: opts(['sendgrid', 'SendGrid API'], ['smtp', 'SMTP server']),
      },
      {
        key: 'api_key',
        label: 'SendGrid API key',
        type: 'password',
        required: true,
        placeholder: 'SG.xxxx',
        help: 'Needs the Mail Send permission.',
        showIf: { provider: 'sendgrid' },
      },
      {
        key: 'smtp_host',
        label: 'SMTP host',
        type: 'text',
        required: true,
        placeholder: 'smtp.example.com',
        showIf: { provider: 'smtp' },
      },
      { key: 'smtp_port', label: 'SMTP port', type: 'text', def: '587', showIf: { provider: 'smtp' } },
      {
        key: 'smtp_secure',
        label: 'Encryption',
        type: 'select',
        def: 'tls',
        options: opts(['tls', 'STARTTLS'], ['ssl', 'SSL/TLS'], ['none', 'None']),
        showIf: { provider: 'smtp' },
      },
      { key: 'smtp_user', label: 'SMTP username', type: 'text', showIf: { provider: 'smtp' } },
      { key: 'smtp_pass', label: 'SMTP password', type: 'password', showIf: { provider: 'smtp' } },
      {
        key: 'from_email',
        label: 'From address',
        type: 'text',
        required: true,
        placeholder: 'reports@yourcompany.com',
      },
      { key: 'from_name', label: 'From name', type: 'text', placeholder: 'Vizru Reports' },
      { key: 'reply_to', label: 'Reply-to address', type: 'text' },
      {
        key: 'default_to',
        label: 'Default recipients',
        type: 'text',
        placeholder: 'a@x.com, b@y.com',
        help: 'Comma separated.',
      },
      { key: 'default_cc', label: 'Default CC', type: 'text' },
      { key: 'default_bcc', label: 'Default BCC', type: 'text' },
      { key: 'allow_recipient_override', label: 'Let the agent choose recipients', type: 'checkbox', def: true },
      { key: 'subject_prefix', label: 'Subject prefix', type: 'text', placeholder: '[Vizru]' },
    ],
  },
];

export const SKILL_BY_ID: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

/* -------------------------------------------------------------------------- */
/* Workflow skill                                                             */
/* -------------------------------------------------------------------------- */

/** Keys of `AgentNodeSkills::$workflowPurposes`, in the classic dialog's order. */
export const WORKFLOW_PURPOSES: Option[] = opts(
  ['action', 'Perform an action / make a change'],
  ['fetch', 'Fetch or look up data'],
  ['agent', 'Delegate to another AI agent'],
  ['notify', 'Send a notification or message'],
  ['validate', 'Validate or check something'],
  ['transform', 'Transform or process data'],
  ['other', 'Something else'],
);

/** Matches `shapeWorkflowResult()`. */
export const WORKFLOW_RESULT_MODES: Option[] = opts(
  ['full', 'All output rows'],
  ['first_row', 'First row only'],
  ['count', 'Row count only'],
  ['none', 'Nothing (fire and forget)'],
);

/** The JSON Schema types `workflowSkillTools()` accepts for a parameter. */
export const WORKFLOW_PARAM_TYPES: Option[] = opts(
  ['string', 'string'],
  ['number', 'number'],
  ['integer', 'integer'],
  ['boolean', 'boolean'],
);

export interface WorkflowParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface WorkflowTool {
  shortcode: string;
  name: string;
  tool_name: string;
  purpose: string;
  description: string;
  params: WorkflowParam[];
  static_inputs: string;
  result_mode: string;
  is_sub_agent: boolean;
  sub_agent_id: string;
}

export function blankWorkflowTool(): WorkflowTool {
  return {
    shortcode: '',
    name: '',
    tool_name: '',
    purpose: 'action',
    description: '',
    params: [],
    static_inputs: '',
    result_mode: 'full',
    is_sub_agent: false,
    sub_agent_id: '',
  };
}

/* -------------------------------------------------------------------------- */
/* Stored-config helpers                                                      */
/* -------------------------------------------------------------------------- */

export type SkillConfig = Record<string, unknown>;

export function parseSkillConfig(raw: string): SkillConfig {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as SkillConfig) : {};
  } catch {
    return {};
  }
}

/** Workflow tools live under `workflows`; the flat skills just need one value set. */
export function isSkillConfigured(id: SkillId, raw: string): boolean {
  const cfg = parseSkillConfig(raw);
  if (id === 'workflow') return Array.isArray(cfg.workflows) && cfg.workflows.length > 0;
  return Object.values(cfg).some((v) => v !== '' && v !== false && v != null);
}

/** The value a field starts at when the stored config says nothing about it. */
export function skillFieldValue(field: SkillField, cfg: SkillConfig): string | boolean {
  if (Object.prototype.hasOwnProperty.call(cfg, field.key)) {
    const stored = cfg[field.key];
    return field.type === 'checkbox' ? stored === true || stored === 'true' : String(stored ?? '');
  }
  if (field.def !== undefined) return field.def;
  return field.type === 'checkbox' ? false : '';
}

/** A field is only rendered while every `showIf` dependency matches. */
export function isSkillFieldVisible(field: SkillField, values: Record<string, string | boolean>): boolean {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([dep, expected]) => String(values[dep] ?? '') === expected);
}
