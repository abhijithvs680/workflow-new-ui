/**
 * Native settings schema for every workflow block type.
 *
 * Each `name` below is taken from the block's Smarty template in
 * `ui-themes/karma/templates/sys/controllers/workflow/blocks/`. The PHP
 * handler copies unrecognised POST keys straight into `block_properties`, so
 * matching those names is the entire compatibility contract: a workflow
 * configured here is byte-identical to one configured in the classic dialog.
 *
 * When a block type is missing from this map the dialog falls back to a
 * generic property editor (see `BlockSettingsDialog`), which can still read and
 * write any key — nothing becomes unreachable.
 */
import type { BlockSchema, Field, FieldGroup } from './schema';
import { options, select, text, textarea } from './schema';

/* -------------------------------------------------------------------------- */
/* Reusable field clusters                                                    */
/* -------------------------------------------------------------------------- */

/** Data-source picker shared by every spreadsheet block. */
function spreadsheetSource(ssidKey: string): Field[] {
  return [
    {
      kind: 'radio',
      name: '_source_mode',
      label: 'Data source',
      options: options(['app', 'Select from app list'], ['shortcode', 'Select via shortcode']),
      help: 'Shortcode mode accepts a {placeholder}, so the sheet can be chosen at runtime.',
    },
    {
      kind: 'text',
      name: 'ss_short_code',
      label: 'Shortcode',
      placeholder: 'spreadsheet short code or {variable}',
      when: (v) => v._source_mode === 'shortcode',
    },
    { kind: 'app', name: 'd_master_ssid', label: 'App', when: (v) => v._source_mode !== 'shortcode' },
    {
      kind: 'spreadsheet',
      name: ssidKey,
      label: 'Spreadsheet',
      dependsOn: 'd_master_ssid',
      when: (v) => v._source_mode !== 'shortcode',
    },
  ];
}

/** Filter + sort + paging cluster from `ssMultiFilter.tpl`. */
function filterCluster(): Field[] {
  return [
    { kind: 'filters', name: 'filters', label: 'Filters' },
    { kind: 'sort', name: 'sort_by', label: 'Sort by' },
    text('distinct_column', 'Distinct column', { placeholder: 'column name' }),
    text('limit_offset', 'Offset', { placeholder: '0' }),
    text('limit_to', 'Limit', { placeholder: 'e.g. 100' }),
    {
      kind: 'checkbox',
      name: 'big_data',
      label: 'Large dataset',
      checkboxLabel: 'Stream results instead of loading them all',
    },
    {
      kind: 'checkbox',
      name: 'row_count',
      label: 'Row count only',
      checkboxLabel: 'Return only the number of matching rows',
    },
    textarea('alias_column', 'Column aliases', {
      rows: 3,
      monospace: true,
      help: 'One per line, in the form "column as alias".',
    }),
  ];
}

const REALTIME_TOGGLE: Field = {
  kind: 'checkbox',
  name: 'disable_realtime',
  label: 'Realtime',
  trueValue: 'true',
  falseValue: 'false',
  checkboxLabel: 'Disable realtime notifications for this write',
};

/** `inputOrSelect.tpl` renders a text box plus a picker over one field name. */
function idField(name: string, label: string, help: string): Field {
  return text(name, label, { help });
}

function group(title: string | undefined, fields: Field[], description?: string): FieldGroup {
  return { title, description, fields };
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const SPREADSHEET_SOURCE_DEFAULTS = { _source_mode: 'app' };

/**
 * The data-source radio has no property of its own — the platform records the
 * choice in `dynamic_flag`, which it stores as the string `"true"`/`"false"`.
 */
const sourceModeHydrate = (props: Record<string, unknown>) => ({
  _source_mode:
    props.dynamic_flag === true || String(props.dynamic_flag ?? '') === 'true' ? 'shortcode' : 'app',
});

function spreadsheetWriteSchema(title: string, summary: string, withFilters: boolean): BlockSchema {
  return {
    title,
    summary,
    connectionMapping: true,
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [
      group('Target', [...spreadsheetSource('ssid'), REALTIME_TOGGLE]),
      ...(withFilters ? [group('Rows to update', filterCluster())] : []),
    ],
    extraPayload: (v) => ({ dynamic_flag: v._source_mode === 'shortcode' ? 'true' : 'false' }),
    hydrateExtra: sourceModeHydrate,
  };
}

function userBlockSchema(title: string, summary: string, extra: Field[]): BlockSchema {
  return {
    title,
    summary,
    groups: [group(undefined, [text('email', 'Email', { placeholder: 'user@example.com or {email}' }), ...extra])],
  };
}

function fileBlockSchema(title: string, summary: string, extra: Field[] = []): BlockSchema {
  return {
    title,
    summary,
    groups: [
      group(undefined, [
        idField('lid', 'App', 'App id or short code. Accepts a {placeholder}.'),
        idField('cid', 'Collection', 'Collection id. Accepts a {placeholder}.'),
        ...extra,
      ]),
    ],
  };
}

const TRIGGER_FIELDS: Field[] = [
  {
    kind: 'checkbox',
    name: 'auth_required',
    label: 'Authentication',
    checkboxLabel: 'Require an authenticated caller',
  },
  text('user_email', 'User email', {
    help: 'Runs the workflow as this user when authentication is required.',
  }),
];

export const BLOCK_SCHEMAS: Record<string, BlockSchema> = {
  /* ---- Entry & flow ---- */

  datatransfer: {
    title: 'Get Parameters',
    summary: 'Entry point. Its output is the input row every later block reads from.',
    groups: [
      group(undefined, [
        select('notify_type', 'Action', options(['', '— None —'], ['upload', 'Upload'], ['user_creation', 'On user creation'])),
      ]),
    ],
  },

  condition: {
    title: 'Conditional Block',
    summary: 'Branches the workflow. The Yes handle is taken when the expression evaluates true.',
    groups: [
      group(undefined, [
        text('message', 'Condition', {
          full: true,
          monospace: true,
          placeholder: '{status} == "approved"',
          help: 'Reference earlier block output with {block_label.field}.',
        }),
      ]),
    ],
  },

  uniquevalidator: {
    title: 'Unique Validator',
    summary: 'Guards against concurrent duplicate work for the same key.',
    groups: [
      group(undefined, [
        text('value', 'Unique key', { placeholder: '{order_id}', required: true }),
        {
          kind: 'radio',
          name: 'unique_action',
          label: 'Action',
          options: options(['check', 'Create — start a unique check'], ['drop', 'Drop — complete the check']),
        },
        {
          kind: 'note',
          name: '_uv_hint',
          label: '',
          text: 'With Create selected, downstream blocks can test {label.permission == true} to see whether this run holds the lock.',
        },
      ]),
    ],
    // The classic dialog swaps the canvas icon to match the chosen action.
    extraPayload: (v) => ({
      iconPath:
        v.unique_action === 'drop'
          ? '/ui-themes/karma/images/svg/unicheck_block.svg'
          : '/ui-themes/karma/images/svg/create-block-2.svg',
    }),
  },

  setvariable: {
    title: 'Set Variable',
    summary: 'Defines named values later blocks can reference as {name}.',
    groups: [group(undefined, [{ kind: 'variables', name: 'variables', label: 'Variables' }])],
  },

  clearoutput: {
    title: 'Clear Output Block',
    summary: 'Empties the accumulated output so later blocks start from a clean row.',
    groups: [group(undefined, [{ kind: 'note', name: '_co', label: '', text: 'This block has no settings beyond its label and description.' }])],
  },

  arrayextract: {
    title: 'Array Extract',
    summary: 'Pulls matching values out of an array in the current output.',
    groups: [
      group(undefined, [
        text('regex', 'Regex', { monospace: true }),
        text('data_selector', 'Data selector', { placeholder: '{block.rows}' }),
        text('output_key', 'Output key'),
        select('sort_order', 'Sort order', options(['none', 'None'], ['asc', 'Ascending'], ['desc', 'Descending'])),
      ]),
    ],
    defaults: { sort_order: 'none' },
  },

  /* ---- Output ---- */

  customoutput: {
    title: 'Custom Output',
    summary: 'Replaces the HTTP response body and status for this workflow.',
    groups: [
      group(undefined, [
        select(
          'headerStatusCode',
          'HTTP status',
          options(['200', '200'], ['302', '302'], ['400', '400'], ['401', '401'], ['403', '403'], ['404', '404'], ['500', '500'], ['503', '503']),
        ),
        select('outputDataType', 'Output type', options(['string', 'String'], ['json', 'JSON'])),
        textarea('outData', 'Output data', { rows: 8, monospace: true }),
      ]),
    ],
    defaults: { headerStatusCode: '200', outputDataType: 'string' },
  },

  return: {
    title: 'Return',
    summary: 'Ends the workflow and returns either text or a stored file.',
    groups: [
      group(undefined, [
        select('returnType', 'Return type', options(['text', 'Text'], ['file', 'File'])),
        textarea('textData', 'Text', { rows: 7, when: (v) => v.returnType !== 'file' }),
        idField('lid', 'App', 'App id holding the file. Accepts a {placeholder}.'),
        idField('cid', 'Collection', 'Collection id. Accepts a {placeholder}.'),
        idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
      ]),
      group('Response headers', [
        {
          kind: 'checkbox',
          name: 'contentTypeOverride',
          label: 'Content type',
          checkboxLabel: 'Override the response Content-Type',
        },
        text('contentType', 'Content-Type', {
          placeholder: 'application/pdf',
          when: (v) => !!v.contentTypeOverride,
        }),
      ]),
    ],
    defaults: { returnType: 'text' },
  },

  downloadasfile: {
    title: 'Download as File',
    summary: 'Serializes the current output to a file for download or storage.',
    groups: [
      group(undefined, [
        select('fileAction', 'Action', options(['download', 'Download to client'], ['save', 'Save to remote'])),
        select('fileType', 'File type', options(['csv', 'CSV'], ['xls', 'Excel'], ['txt', 'Text'])),
        select('charSet', 'Charset', options(['utf-8', 'UTF-8'], ['windows-1252', 'ANSI'], ['us-ascii', 'US-ASCII'])),
        text('fileName', 'File name'),
        textarea('columnData', 'Header columns', { rows: 3 }),
        textarea('outData', 'JSON data', { rows: 6, monospace: true }),
      ]),
    ],
    defaults: { fileAction: 'download', fileType: 'csv', charSet: 'utf-8' },
  },

  realtimepush: {
    title: 'Realtime Push',
    summary: 'Pushes a live message to a connected client over the realtime socket.',
    groups: [
      group('Target', [
        select('identifier', 'Identifier', options(['guid', 'GUID'], ['job_id', 'Job id'])),
        text('guid', 'GUID', { when: (v) => v.identifier === 'guid' }),
        text('jobid', 'Job id', { when: (v) => v.identifier === 'job_id' }),
        {
          kind: 'checkbox',
          name: 'notification_log',
          label: 'Save to collection',
          checkboxLabel: 'Notify when online, save to Inbox when offline',
          when: (v) => v.identifier === 'job_id',
        },
        text('tags', 'Tag', { help: 'Socket event name the client listens on.' }),
      ]),
      group('Payload', [{ kind: 'variables', name: 'variables', label: 'Variables' }]),
    ],
    defaults: { identifier: 'guid' },
  },

  /* ---- Actions ---- */

  sendmail: {
    title: 'Send Mail',
    summary: 'Sends an email. Recipients and body come from the connection mapping.',
    connectionMapping: true,
    groups: [
      group(undefined, [
        select('notify_type', 'Schedule', options(['1', 'Send now'], ['7', 'Weekly'], ['30', 'Monthly'])),
      ]),
    ],
    defaults: { notify_type: '1' },
  },

  notify: {
    title: 'Notification',
    summary: 'Raises an in-app notification.',
    groups: [
      group(undefined, [
        select(
          'notify_type',
          'Notification type',
          options(['success', 'Success'], ['danger', 'Error'], ['warning', 'Warning'], ['info', 'Info']),
          { allowCustom: true, help: 'A {placeholder} may be used instead of a fixed type.' },
        ),
        text('message', 'Message', { full: true }),
      ]),
    ],
  },

  genericpost: { title: 'Generic POST', summary: 'Exposes this workflow as an authenticated POST endpoint.', groups: [group(undefined, TRIGGER_FIELDS)] },
  genericget: { title: 'Generic GET', summary: 'Exposes this workflow as an authenticated GET endpoint.', groups: [group(undefined, TRIGGER_FIELDS)] },
  twilio: { title: 'Twilio', summary: 'Twilio inbound trigger.', groups: [group(undefined, TRIGGER_FIELDS)] },
  retarusfax: { title: 'Retarus Fax', summary: 'Retarus fax trigger.', groups: [group(undefined, TRIGGER_FIELDS)] },
  retarussms: { title: 'Retarus SMS', summary: 'Retarus SMS trigger.', groups: [group(undefined, TRIGGER_FIELDS)] },

  /* ---- Spreadsheets ---- */

  ssdatafilter: {
    title: 'Spreadsheet Filter',
    summary: 'Reads rows from a spreadsheet and passes them to the next block.',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [group('Source', spreadsheetSource('s_master_ssid')), group('Filter', filterCluster())],
    extraPayload: (v) => ({ dynamic_flag: v._source_mode === 'shortcode' ? 'true' : 'false' }),
    hydrateExtra: sourceModeHydrate,
  },

  ssdeleterow: {
    title: 'Spreadsheet Delete Row',
    summary: 'Deletes every row matching the filter.',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [group('Source', spreadsheetSource('s_master_ssid')), group('Rows to delete', filterCluster())],
    extraPayload: (v) => ({ dynamic_flag: v._source_mode === 'shortcode' ? 'true' : 'false' }),
    hydrateExtra: sourceModeHydrate,
  },

  ssautoincrementcol: {
    title: 'Spreadsheet Increment Column',
    summary: 'Increments a numeric column on the matching rows.',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [
      group('Source', spreadsheetSource('s_master_ssid')),
      group('Rows', filterCluster()),
      group('Increment', [text('increment_column', 'Increment column', { required: true })]),
    ],
    extraPayload: (v) => ({ dynamic_flag: v._source_mode === 'shortcode' ? 'true' : 'false' }),
    hydrateExtra: sourceModeHydrate,
  },

  insertssdata: spreadsheetWriteSchema('Spreadsheet Data Insert', 'Appends the current output as new rows.', false),
  bulkinsertssdata: spreadsheetWriteSchema('Spreadsheet Bulk Data Insert', 'Appends many rows in one operation.', false),
  updatessdata: spreadsheetWriteSchema('Spreadsheet Data Update', 'Updates the rows matching the filter.', true),
  insertorupdatessdata: spreadsheetWriteSchema(
    'Spreadsheet Data Insert Or Update',
    'Updates matching rows, or inserts when nothing matches.',
    true,
  ),

  tospreadsheet: {
    title: 'Convert To Spreadsheet',
    summary: 'Writes the current output into a spreadsheet document.',
    groups: [
      group(undefined, [
        { kind: 'app', name: 'd_master_ssid', label: 'Destination app' },
        { kind: 'spreadsheet', name: 's_master_ssid', label: 'Destination spreadsheet', dependsOn: 'd_master_ssid' },
      ]),
    ],
  },

  livespace: {
    title: 'App Document',
    summary: 'Selects a document inside an app.',
    connectionMapping: true,
    groups: [
      group(undefined, [
        { kind: 'app', name: 'd_master_ssid', label: 'App' },
        { kind: 'document', name: 's_master_ssid', label: 'Document', dependsOn: 'd_master_ssid' },
      ]),
    ],
  },

  /* ---- Files ---- */

  getfiles: fileBlockSchema('Get Files', 'Lists files in a collection.'),
  deletefile: fileBlockSchema('Delete File', 'Deletes one stored file.', [
    idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
  ]),
  getfiledetails: fileBlockSchema('Get File Details', 'Reads metadata for one file.', [
    idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
  ]),
  processfile: fileBlockSchema('Process File', 'Parses a stored file into rows.', [
    idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
  ]),
  movefile: fileBlockSchema('Move File', 'Moves a file to another collection.', [
    idField('new-cid', 'New collection', 'Destination collection id.'),
    idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
  ]),
  copyfile: fileBlockSchema('Copy File', 'Copies a file into another app or collection.', [
    idField('fid', 'File', 'File id. Accepts a {placeholder}.'),
    idField('new-lid', 'New app', 'Destination app id.'),
    idField('new-cid', 'New collection', 'Destination collection id.'),
  ]),
  createfile: fileBlockSchema('Create File', 'Creates a file from data, a URL, or the request.', [
    select('operationType', 'Type', options(['data', 'Data'], ['url', 'URL'], ['file', 'File in request'])),
    text('filename', 'Name'),
    text('data', 'Input', { help: 'The data, or the source URL, depending on Type.' }),
    text('mimetype', 'Mime type'),
  ]),
  chatfileupload: fileBlockSchema('File Upload', 'Accepts an uploaded file from the caller.', [
    text('tags', 'Tags'),
  ]),

  zipfiles: {
    title: 'Zip Files',
    summary: 'Bundles files into a single archive.',
    groups: [
      group(undefined, [
        idField('lid', 'App', 'App id. Accepts a {placeholder}.'),
        idField('cid', 'Collection', 'Collection id. Accepts a {placeholder}.'),
        text('filename', 'Archive name'),
      ]),
    ],
  },

  googleocr: {
    title: 'Google OCR',
    summary: 'Extracts text from an image or PDF.',
    groups: [group(undefined, [text('file_path', 'File path'), text('fields', 'Fields')])],
  },

  /* ---- Compute ---- */

  date: {
    title: 'Date',
    summary: 'Parses, shifts and reformats dates into named output keys.',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'Date operations',
          addLabel: 'Add date operation',
          columns: [
            { name: 'key', label: 'Output key', grow: 1 },
            { name: 'input_date', label: 'Input', grow: 1.4, placeholder: '{created_at}' },
            {
              name: 'operator',
              label: 'Operator',
              kind: 'select',
              grow: 0.8,
              options: options(['', '—'], ['+', '+'], ['-', '−']),
            },
            { name: 'value', label: 'Value', grow: 0.7 },
            { name: 'time', label: 'Unit', kind: 'select', grow: 0.9, options: options(['day', 'day'], ['month', 'month'], ['year', 'year'], ['hour', 'hour'], ['minute', 'minute'], ['second', 'second']) },
            { name: 'informat', label: 'In format', grow: 1 },
            { name: 'outformat', label: 'Out format', grow: 1 },
          ],
        },
      ]),
    ],
  },

  math: {
    title: 'Math',
    summary: 'Evaluates arithmetic expressions into named output keys.',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'Expressions',
          addLabel: 'Add expression',
          columns: [
            { name: 'key', label: 'Output key', grow: 1 },
            { name: 'math_input', label: 'Expression', grow: 3, placeholder: '{qty} * {price}' },
          ],
        },
      ]),
    ],
  },

  string: {
    title: 'String',
    summary: 'Transforms text into named output keys.',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'Operations',
          addLabel: 'Add operation',
          columns: [
            { name: 'key', label: 'Output key', grow: 1 },
            {
              name: 'type',
              label: 'Operation',
              kind: 'select',
              grow: 1,
              options: options(
                ['uppercase', 'Uppercase'],
                ['lowercase', 'Lowercase'],
                ['trim', 'Trim'],
                ['length', 'Length'],
                ['substring', 'Substring'],
                ['replace', 'Replace'],
                ['split', 'Split'],
                ['match', 'Regex match'],
              ),
            },
            { name: 'input_string', label: 'Input', grow: 1.6, placeholder: '{name}' },
            { name: 'regex', label: 'Pattern', grow: 1.2 },
            { name: 'offset', label: 'Offset', grow: 0.6 },
          ],
        },
      ]),
    ],
  },

  /* ---- Workflows ---- */

  executeworkflow: {
    title: 'Execute Workflow',
    summary: 'Runs another workflow as a child of this one.',
    // Classic maps this to the untabbed layout — no Connection Mapping tab.
    groups: [
      group(undefined, [
        text('namespace', 'Namespace', {
          help: 'Prefix for the child output, so {namespace.field} stays unambiguous.',
        }),
        text('loop', 'Loop over', {
          help: 'Run the child once per row of this array, e.g. {filter.rows}.',
        }),
        textarea('extra_params', 'Extra parameters', { rows: 3, monospace: true }),
        { kind: 'params', name: 'reusable_params', label: 'Inputs' },
      ]),
    ],
  },

  backgroundworkflow: {
    title: 'Background Workflow',
    summary: 'Queues another workflow to run detached from this request.',
    groups: [
      group(undefined, [
        { kind: 'workflowSearch', name: 'background_short_code', label: 'Workflow' },
        text('namespace', 'Namespace'),
      ]),
    ],
  },

  livecloudfunction: {
    title: 'LiveCloud Function',
    summary: 'Calls a LiveCloud function.',
    connectionMapping: true,
    groups: [group(undefined, [text('namespace', 'Namespace')])],
  },

  /* ---- User management ---- */

  adduser: userBlockSchema('Add / Edit User', 'Creates or updates a tenant user.', [
    text('name', 'Name'),
    text('fedId', 'Federation id'),
    idField('customerName', 'Group', 'Tenant group name. Accepts a {placeholder}.'),
    idField('systemRoleName', 'Global role', 'Global role name. Accepts a {placeholder}.'),
    {
      kind: 'checkbox',
      name: 'sendmail',
      label: 'Welcome mail',
      trueValue: 'on',
      falseValue: '',
      checkboxLabel: 'Send a welcome email',
    },
  ]),
  getuser: userBlockSchema('Get User Details', 'Looks up one user by email.', []),
  getuserlivespaces: userBlockSchema('Get User App List', 'Lists the apps a user belongs to.', []),
  deactivateuser: userBlockSchema('Deactivate User', 'Disables a tenant user.', []),
  addusertolivespace: userBlockSchema('Add User to App', 'Grants a user access to an app.', [
    text('livespace_shortcode', 'App short code'),
    text('livespaceroleName', 'App role'),
  ]),
  removeuserfromlivespace: userBlockSchema('Remove User from App', 'Revokes a user’s access to an app.', [
    text('livespace_shortcode', 'App short code'),
  ]),
  getlivespacemembers: {
    title: 'Get App Members',
    summary: 'Lists the members of an app.',
    groups: [group(undefined, [text('livespace_shortcode', 'App short code')])],
  },
  setlanding: userBlockSchema('Set User Landing Page', 'Chooses which dashboard a user lands on.', [
    text('livespace_shortcode', 'App short code'),
    text('dashboardShortCode', 'Dashboard short code'),
  ]),

  /* ---- Rover ---- */

  roverai: {
    title: 'AI Extract',
    summary: 'Runs a Rover extraction project against the current input.',
    groups: [
      group(undefined, [
        text('rover_url', 'Rover URL'),
        text('project', 'Project'),
        text('searchsource', 'Search source'),
        textarea('question', 'Question', { rows: 3 }),
        textarea('goal', 'Goal', { rows: 3 }),
        textarea('instructions', 'Instructions', { rows: 5 }),
        text('notify_type', 'Notification type'),
      ]),
    ],
  },

  roveragent: {
    title: 'AI Transform',
    summary: 'Runs a Rover transformation project against the current input.',
    groups: [
      group(undefined, [
        text('rover_url', 'Rover URL'),
        text('project', 'Project'),
        textarea('purpose', 'Purpose', { rows: 3 }),
        textarea('question', 'Question', { rows: 4 }),
      ]),
    ],
  },
};

/** Blocks whose settings UI is not yet ported; see the note in the dialog. */
export const UNPORTED_BLOCKS: Record<string, string> = {
  ruleengine:
    'Dashboard Rule builds its editor from the selected dashboard’s live object, filter and button inventory.',
  formrule:
    'Form Rule builds its editor from the selected form’s tab, group and field inventory.',
  ssadvdatafilter:
    'Spreadsheet Joined Filter needs the two-sheet column inventory to render its join and per-sheet filters.',
};

export function schemaFor(blockType: string): BlockSchema | null {
  return BLOCK_SCHEMAS[blockType] || null;
}
