/**
 * Native settings schema for every workflow block type.
 *
 * Two things here are copied verbatim from the platform and must not drift:
 *
 *  1. **Field names.** Each `name` is the input name in the block's Smarty
 *     template under `ui-themes/karma/templates/sys/controllers/workflow/blocks/`.
 *     `customblockPropInsert` copies unrecognised POST keys straight into
 *     `block_properties`, so matching those names is the entire compatibility
 *     contract: a workflow configured here is byte-identical to one configured
 *     in the classic dialog.
 *
 *  2. **Layout, order and labels.** `layout` mirrors the second entry of
 *     `Customblockpopup::$templateArray` — `tabbedBlockSettings.tpl` (tabbed),
 *     `blockSettings.tpl` (untabbed), or one of the bespoke Date/Math/String/
 *     rule layouts (plain). Fields appear in the same order, under the same
 *     labels, with the same option values as the template renders them. Blocks
 *     absent from `$templateArray` fall through to `$default`, which is the
 *     tabbed layout with no block-specific fields at all.
 *
 * When a block type is missing from this map the dialog falls back to a
 * generic property editor (see `BlockSettingsDialog`), which can still read and
 * write any key — nothing becomes unreachable.
 */
import type { BlockSchema, Field, FieldGroup, RowsetColumn } from './schema';
import { options, select, text, textarea } from './schema';

/* -------------------------------------------------------------------------- */
/* Reusable field clusters                                                    */
/* -------------------------------------------------------------------------- */

/**
 * `blockComponents/spreadSheetSelect.tpl`, in its own order:
 * Data source → [Realtime] → Shortcode → App → Spreadsheet.
 *
 * The Realtime row is rendered only for the three write blocks whose
 * `block_type` the template names explicitly; Bulk Data Insert is not one.
 */
function spreadsheetSource(ssidKey: string, realtime = false): Field[] {
  return [
    {
      kind: 'radio',
      name: '_source_mode',
      label: 'Data source',
      options: options(['app', 'Select from app list'], ['shortcode', 'Select via shortcode']),
    },
    ...(realtime
      ? ([
          {
            kind: 'checkbox',
            name: 'disable_realtime',
            label: 'Realtime',
            checkboxLabel: 'Disable',
            // The classic form posts the raw checkbox state; the template reads
            // back either "true" or the browser's "on".
            trueValue: 'true',
            falseValue: 'false',
          },
        ] as Field[])
      : []),
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

/**
 * The filter rows from `blockComponents/ssMultiFilter.tpl`. Every spreadsheet
 * block that includes the component gets these.
 */
function filterRows(): Field {
  return { kind: 'filters', name: 'filters', label: 'Filters' };
}

/**
 * The rest of `ssMultiFilter.tpl` sits behind `{if $blockType eq 'ssdatafilter'}`
 * — Spreadsheet Filter is the only block that shows sorting, paging, aliases,
 * distinct and the large-data switches.
 */
function ssAdvancedSettings(): FieldGroup {
  return group('Advanced Settings', [
    // The template pairs these two switches on one row, and Limit From/To on
    // the next; everything after them is a full-width row of its own.
    {
      kind: 'checkbox',
      name: 'big_data',
      label: '',
      checkboxLabel: 'Enable for large data',
      half: true,
    },
    {
      kind: 'checkbox',
      name: 'row_count',
      label: '',
      checkboxLabel: 'Row count only',
      half: true,
    },
    text('limit_offset', 'Limit From', { half: true }),
    text('limit_to', 'Limit To', { half: true }),
    textarea('alias_column', 'Column Alias', {
      rows: 3,
      monospace: true,
      placeholder: 'col as value\ncol as value',
      generate: 'columnAlias',
    }),
    text('distinct_column', 'Distinct Column'),
    { kind: 'sort', name: 'sort_by', label: 'Sort Order' },
  ]);
}

/** `blockComponents/inputOrSelect.tpl` — a text box plus a picker over one name. */
function idField(name: string, label: string): Field {
  return text(name, label);
}

function group(title: string | undefined, fields: Field[], description?: string): FieldGroup {
  return { title, description, fields };
}

/** `fileOperationsBlock.tpl` always opens with App and Collection. */
function fileTarget(): Field[] {
  return [
    idField('lid', 'App'),
    idField('cid', 'Collection'),
  ];
}

const FILE_FIELD = idField('fid', 'File');

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

const dynamicFlagPayload = (v: Record<string, unknown>) => ({
  dynamic_flag: v._source_mode === 'shortcode' ? 'true' : 'false',
});

/** Insert / Bulk Insert / Update / Insert-or-Update all use `ssInsertOrUpdateBlock.tpl`. */
function spreadsheetWriteSchema(
  title: string,
  summary: string,
  opts: { filters: boolean; realtime: boolean },
): BlockSchema {
  return {
    title,
    summary,
    layout: 'tabbed',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [
      group(undefined, [
        ...spreadsheetSource('ssid', opts.realtime),
        ...(opts.filters ? [filterRows()] : []),
      ]),
    ],
    extraPayload: dynamicFlagPayload,
    hydrateExtra: sourceModeHydrate,
  };
}

/** `usermanagement.tpl` opens with Email for every block except Get App Members. */
function userBlockSchema(title: string, summary: string, extra: Field[] = []): BlockSchema {
  return {
    title,
    summary,
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('email', 'Email', { placeholder: 'user@example.com or {email}' }),
        ...extra,
      ]),
    ],
  };
}

function fileBlockSchema(title: string, summary: string, extra: Field[] = []): BlockSchema {
  return {
    title,
    summary,
    layout: 'untabbed',
    groups: [group(undefined, [...fileTarget(), ...extra])],
  };
}

/** `triggerBlocks.tpl`. */
const TRIGGER_FIELDS: Field[] = [
  {
    kind: 'checkbox',
    name: 'auth_required',
    label: 'Authentication Required?',
    checkboxLabel: 'Require an authenticated caller',
  },
  text('actor_id', 'Run as', {
    placeholder: 'user@example.com',
  }),
];

function triggerSchema(title: string, summary: string): BlockSchema {
  return { title, summary, layout: 'untabbed', groups: [group(undefined, TRIGGER_FIELDS)] };
}

/**
 * A block the classic dialog opens with the tabbed layout and **no** subFile —
 * Label, Description, Connection Mapping and Notes, nothing else. Its
 * `block_properties` are still reachable through the Advanced tab.
 */
function noFieldsTabbed(title: string, summary: string): BlockSchema {
  return {
    title,
    summary,
    layout: 'tabbed',
    groups: [],
  };
}

const DATE_FORMATS = options(
  ['', 'Select'],
  ['timestamp', 'Timestamp'],
  ['m/d/Y', 'm/d/Y'],
  ['m-d-Y', 'm-d-Y'],
  ['Y/m/d', 'Y/m/d'],
  ['Y-m-d', 'Y-m-d'],
  ['d/m/Y', 'd/m/Y'],
  ['d-m-Y', 'd-m-Y'],
);

/** Output format adds the single-unit and difference formats. */
const DATE_OUT_FORMATS = [
  ...DATE_FORMATS,
  ...options(
    ['d', 'd'],
    ['m', 'm'],
    ['Y', 'Y'],
    ['days', 'days'],
    ['months', 'months'],
    ['years', 'years'],
    ['hours', 'hours'],
    ['minutes', 'minutes'],
    ['seconds', 'seconds'],
  ),
];

const DATE_COLUMNS: RowsetColumn[] = [
  { name: 'key', label: 'Variable', grow: 1 },
  {
    name: 'time',
    label: 'With time',
    kind: 'checkbox',
    grow: 0.7,
    // dateLayout.tpl seeds a new row with the box ticked.
    trueValue: 'true',
    falseValue: 'false',
    defaultValue: 'true',
  },
  { name: 'input_date', label: 'Date 1', grow: 1.2, placeholder: '{created_at}' },
  {
    name: 'operator',
    label: 'Action',
    kind: 'select',
    grow: 1,
    options: options(
      ['', 'None'],
      ['add', 'Additon'],
      ['sub', 'Subtraction'],
      ['diff', 'Difference'],
      ['comp', 'Compare'],
    ),
  },
  // The layout relabels this "Date 2" for Difference and Compare.
  { name: 'value', label: 'Interval', grow: 0.9 },
  { name: 'informat', label: 'Input Format', kind: 'select', grow: 1, options: DATE_FORMATS },
  { name: 'outformat', label: 'Output Format', kind: 'select', grow: 1, options: DATE_OUT_FORMATS },
];

const STRING_COLUMNS: RowsetColumn[] = [
  { name: 'key', label: 'Variable', grow: 1 },
  {
    name: 'type',
    label: 'Action',
    kind: 'select',
    grow: 1.2,
    options: options(
      ['regE', 'regexE(Extract)'],
      ['regM', 'regexM(Match)'],
      ['regR', 'regexR(Replace)'],
      ['upper', 'String To Upper'],
      ['lower', 'String To Lower'],
      ['strlen', 'String Length'],
      ['implode', 'Implode'],
      ['urlencode', 'URL Encode'],
      ['urldecode', 'URL Decode'],
      ['unicodeEscape', 'Unicode Escape'],
      ['unicodeUnescape', 'Unicode Un-escape'],
      ['compareString', 'Compare String'],
      ['explode', 'Explode'],
      ['substrcount', 'Substring Count'],
      ['stringreplace', 'String Replace'],
      ['substr', 'Substr'],
      ['ltrim', 'Ltrim'],
      ['rtrim', 'Rtrim'],
    ),
  },
  // stringLayout.tpl renames these per action (Find/Replace, Start/Length, …).
  { name: 'regex', label: 'Pattern', grow: 1 },
  { name: 'input_string', label: 'Input', grow: 1.4, placeholder: '{name}' },
  { name: 'offset', label: 'Offset', grow: 0.8 },
];

export const BLOCK_SCHEMAS: Record<string, BlockSchema> = {
  /* ---- Entry & flow ---- */

  datatransfer: {
    title: 'Get Parameters',
    summary: 'Entry point. Its output is the input row every later block reads from.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select(
          'notify_type',
          'Action',
          options(['upload', 'Upload'], ['user_creation', 'On User Creation']),
        ),
      ]),
    ],
  },

  condition: {
    title: 'Conditional Block',
    summary: 'Branches the workflow. The Yes handle is taken when the expression evaluates true.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('message', 'Condition', {
          full: true,
          monospace: true,
          placeholder: '{status} == "approved"',
        }),
      ]),
    ],
  },

  uniquevalidator: {
    title: 'Unique Validator',
    summary: 'Guards against concurrent duplicate work for the same key.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('value', 'Unique Key', { placeholder: '{order_id}', required: true }),
        {
          kind: 'radio',
          name: 'unique_action',
          label: 'Action',
          options: options(
            ['check', 'Create — To create a unique check'],
            ['drop', 'Drop — To complete the check'],
          ),
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
    layout: 'untabbed',
    groups: [group(undefined, [{ kind: 'variables', name: 'variables', label: 'Variable' }])],
  },

  clearoutput: noFieldsTabbed(
    'Clear Output Block',
    'Empties the accumulated output so later blocks start from a clean row.',
  ),

  arrayextract: {
    title: 'Array Extract Block',
    summary: 'Pulls matching values out of an array in the current output.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('regex', 'Regex', { monospace: true }),
        text('data_selector', 'Data Selector', { placeholder: '{block.rows}' }),
        text('output_key', 'Output Key'),
        select('sort_order', 'Sort Order', options(['none', 'None'], ['desc', 'Desc'], ['asc', 'Asc'])),
      ]),
    ],
    defaults: { sort_order: 'none' },
  },

  /* ---- Output ---- */

  customoutput: {
    title: 'Custom Output',
    summary: 'Replaces the HTTP response body and status for this workflow.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select(
          'headerStatusCode',
          'Header Status Code',
          options(
            ['200', '200'],
            ['400', '400'],
            ['401', '401'],
            ['403', '403'],
            ['404', '404'],
            ['302', '302'],
            ['500', '500'],
            ['503', '503'],
          ),
        ),
        select('outputDataType', 'Output Data Type', options(['string', 'String'], ['json', 'Json'])),
        textarea('outData', 'Output Data', { rows: 8, monospace: true }),
      ]),
    ],
    defaults: { headerStatusCode: '200', outputDataType: 'string' },
  },

  return: {
    title: 'Return',
    summary: 'Ends the workflow and returns either text or a stored file.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select('returnType', 'Return Type', options(['file', 'File'], ['text', 'Text'])),
        textarea('textData', 'Text', { rows: 7, when: (v) => v.returnType !== 'file' }),
        // returnBlock.tpl includes fileOperationsBlock.tpl, which for `return`
        // renders App, Collection and File.
        ...fileTarget().map((f) => ({ ...f, when: (v: Record<string, unknown>) => v.returnType === 'file' })),
        { ...FILE_FIELD, when: (v: Record<string, unknown>) => v.returnType === 'file' } as Field,
        {
          kind: 'checkbox',
          name: 'contentTypeOverride',
          label: 'Set ContentType',
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
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select('fileAction', 'Action', options(['download', 'Download to Client'], ['save', 'Save to Remote'])),
        select('fileType', 'File Type', options(['csv', 'CSV'], ['xls', 'Excel'], ['txt', 'Text'])),
        select(
          'charSet',
          'Charset',
          options(['utf-8', 'utf-8'], ['windows-1252', 'ansi'], ['us-ascii', 'us-ascii']),
        ),
        text('fileName', 'File Name'),
        textarea('columnData', 'Header Column', { rows: 3 }),
        textarea('outData', 'Json Data', { rows: 6, monospace: true }),
      ]),
    ],
    defaults: { fileAction: 'download', fileType: 'csv', charSet: 'utf-8' },
  },

  realtimepush: {
    title: 'Realtime Push',
    summary: 'Pushes a live message to a connected client over the realtime socket.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select('identifier', 'Identifier', options(['guid', 'GUID'], ['job_id', 'Job Id'])),
        text('guid', 'GUID', { when: (v) => v.identifier === 'guid' }),
        text('jobid', 'Job ID', { when: (v) => v.identifier === 'job_id' }),
        {
          kind: 'checkbox',
          name: 'notification_log',
          label: 'Save to Collection',
          checkboxLabel: 'Notify when online, save to Inbox when offline.',
          when: (v) => v.identifier === 'job_id',
        },
        text('tags', 'Tag'),
        { kind: 'variables', name: 'variables', label: 'Variable' },
      ]),
    ],
    defaults: { identifier: 'guid' },
  },

  /* ---- Actions ---- */

  sendmail: {
    title: 'Send Mail',
    summary: 'Sends an email. Recipients and body come from the connection mapping.',
    layout: 'tabbed',
    groups: [
      group(undefined, [
        select('notify_type', 'Schedule Email', options(['1', 'Send Now'], ['7', 'Weekly'], ['30', 'Monthly'])),
      ]),
    ],
    defaults: { notify_type: '1' },
  },

  notify: {
    title: 'Notification',
    summary: 'Raises an in-app notification.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        select(
          'notify_type',
          'Notification Type',
          options(['success', 'success'], ['danger', 'error'], ['warning', 'warning'], ['info', 'info']),
          { allowCustom: true },
        ),
        text('message', 'Message', { full: true }),
      ]),
    ],
  },

  genericpost: triggerSchema('Generic POST', 'Exposes this workflow as an authenticated POST endpoint.'),
  genericget: triggerSchema('Generic GET', 'Exposes this workflow as an authenticated GET endpoint.'),
  twilio: triggerSchema('Twilio', 'Twilio inbound trigger.'),
  retarusfax: triggerSchema('Retarus Fax', 'Retarus fax trigger.'),
  retarussms: triggerSchema('Retarus SMS', 'Retarus SMS trigger.'),

  /* ---- Spreadsheets ---- */

  ssdatafilter: {
    title: 'Spreadsheet Filter',
    summary: 'Reads rows from a spreadsheet and passes them to the next block.',
    layout: 'untabbed',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [
      group(undefined, [...spreadsheetSource('s_master_ssid'), filterRows()]),
      ssAdvancedSettings(),
    ],
    extraPayload: dynamicFlagPayload,
    hydrateExtra: sourceModeHydrate,
  },

  /**
   * Relational Filter reads through the MCP mirrors rather than the spreadsheet
   * engine, so it has no filter rows — the SELECT is the filter. The App picker
   * exists only to scope `{!short_code!}` autocomplete; the query names its own
   * tables, and `RelationalFilterBlock` rewrites each reference to `ss_CODE`.
   */
  relationalfilter: {
    title: 'Relational Filter',
    summary: 'Reads rows with a read-only PostgreSQL SELECT across spreadsheet mirrors.',
    layout: 'untabbed',
    groups: [
      group('Database selection', [
        {
          kind: 'app',
          name: 'd_master_ssid',
          label: 'App',
          help: 'Sets which spreadsheets the query editor offers. It does not restrict the query.',
        },
      ]),
      group('SQL query', [
        {
          kind: 'sql',
          name: 'sql_query',
          label: 'SQL Query',
          dependsOn: 'd_master_ssid',
          required: true,
          rows: 12,
          placeholder:
            'SELECT * FROM {!EMP001!} e JOIN {!DEPT001!} d ON e.dept_id = d._row_id WHERE e.salary > {amount}',
          help: 'One SELECT statement. Writes and DDL are refused, and results are capped at 500 rows.',
        },
      ]),
    ],
  },

  ssdeleterow: {
    title: 'Spreadsheet Delete Row',
    summary: 'Deletes every row matching the filter.',
    layout: 'untabbed',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [group(undefined, [...spreadsheetSource('s_master_ssid'), filterRows()])],
    extraPayload: dynamicFlagPayload,
    hydrateExtra: sourceModeHydrate,
  },

  ssautoincrementcol: {
    title: 'Spreadsheet Increment Column',
    summary: 'Increments a numeric column on the matching rows.',
    layout: 'untabbed',
    defaults: SPREADSHEET_SOURCE_DEFAULTS,
    groups: [
      group(undefined, [
        ...spreadsheetSource('s_master_ssid'),
        filterRows(),
        text('increment_column', 'Increment Column', { required: true }),
      ]),
    ],
    extraPayload: dynamicFlagPayload,
    hydrateExtra: sourceModeHydrate,
  },

  insertssdata: spreadsheetWriteSchema(
    'Spreadsheet Data Insert',
    'Appends the current output as new rows.',
    { filters: false, realtime: true },
  ),
  bulkinsertssdata: spreadsheetWriteSchema(
    'Spreadsheet Bulk Data Insert',
    'Appends many rows in one operation.',
    { filters: false, realtime: false },
  ),
  updatessdata: spreadsheetWriteSchema(
    'Spreadsheet Data Update',
    'Updates the rows matching the filter.',
    { filters: true, realtime: true },
  ),
  insertorupdatessdata: spreadsheetWriteSchema(
    'Spreadsheet Data Insert Or Update',
    'Updates matching rows, or inserts when nothing matches.',
    { filters: true, realtime: true },
  ),

  // $templateArray points `tospreadsheet` at livespaceBlock.tpl, so it shows the
  // same App/Documents pair as App Document — only untabbed.
  tospreadsheet: {
    title: 'Convert To Spreadsheet',
    summary: 'Writes the current output into a spreadsheet document.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        { kind: 'app', name: 'd_master_ssid', label: 'My App' },
        { kind: 'document', name: 's_master_ssid', label: 'Documents', dependsOn: 'd_master_ssid' },
      ]),
    ],
  },

  livespace: {
    title: 'App Document',
    summary: 'Selects a document inside an app.',
    layout: 'tabbed',
    groups: [
      group(undefined, [
        { kind: 'app', name: 'd_master_ssid', label: 'My App' },
        { kind: 'document', name: 's_master_ssid', label: 'Documents', dependsOn: 'd_master_ssid' },
      ]),
    ],
  },

  /* ---- Files ---- */

  getfiles: fileBlockSchema('Get Files', 'Lists files in a collection.'),
  deletefile: fileBlockSchema('Delete File', 'Deletes one stored file.', [FILE_FIELD]),
  getfiledetails: fileBlockSchema('Get File Details', 'Reads metadata for one file.', [FILE_FIELD]),
  processfile: fileBlockSchema('Process File', 'Parses a stored file into rows.', [FILE_FIELD]),
  movefile: fileBlockSchema('Move File', 'Moves a file to another collection.', [
    idField('new-cid', 'New Collection'),
    FILE_FIELD,
  ]),
  copyfile: fileBlockSchema('Copy File', 'Copies a file into another app or collection.', [
    FILE_FIELD,
    idField('new-lid', 'New App'),
    idField('new-cid', 'New Collection'),
  ]),
  createfile: fileBlockSchema('Create File', 'Creates a file from data, a URL, or the request.', [
    select('operationType', 'Type', options(['data', 'Data'], ['url', 'URL'], ['file', 'File in Request'])),
    text('filename', 'Name', { when: (v) => v.operationType !== 'file' }),
    text('data', 'Input', {
      when: (v) => v.operationType !== 'file',
    }),
    text('mimetype', 'Mimetype', { when: (v) => v.operationType !== 'file' }),
  ]),
  chatfileupload: fileBlockSchema('File Upload', 'Accepts an uploaded file from the caller.', [
    text('tags', 'Tags'),
  ]),

  zipfiles: noFieldsTabbed('Zip Files', 'Bundles files into a single archive.'),

  googleocr: {
    title: 'Google OCR',
    summary: 'Extracts text from an image or PDF.',
    layout: 'untabbed',
    groups: [group(undefined, [text('file_path', 'File Path'), text('fields', 'Fields')])],
  },

  /* ---- Compute ---- */

  date: {
    title: 'Date',
    summary: 'Parses, shifts and reformats dates into named output keys.',
    layout: 'plain',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'Date Processor',
          addLabel: 'Add date operation',
          columns: DATE_COLUMNS,
        },
      ]),
    ],
  },

  math: {
    title: 'Math',
    summary: 'Evaluates arithmetic expressions into named output keys.',
    layout: 'plain',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'Math function',
          addLabel: 'Add expression',
          columns: [
            { name: 'key', label: 'Variable', grow: 1 },
            { name: 'math_input', label: 'Expression', kind: 'textarea', grow: 3, placeholder: '{qty} * {price}' },
          ],
        },
      ]),
    ],
  },

  string: {
    title: 'String',
    summary: 'Transforms text into named output keys.',
    layout: 'plain',
    groups: [
      group(undefined, [
        {
          kind: 'rowset',
          name: 'config',
          label: 'String Processor',
          addLabel: 'Add operation',
          columns: STRING_COLUMNS,
        },
      ]),
    ],
  },

  /* ---- Workflows ---- */

  executeworkflow: {
    title: 'Execute Workflow',
    summary: 'Runs another workflow as a child of this one.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('namespace', 'NameSpace'),
        textarea('extra_params', 'Extra Parameters', { rows: 3, monospace: true }),
        {
          kind: 'checkbox',
          name: 'loop',
          label: 'Enable Loop',
          checkboxLabel: 'Run the child once per row of the input array',
        },
        // executeWorkflowBlock.tpl swaps the reusable input grid out for the
        // namespace pair as soon as Enable Loop is ticked.
        { kind: 'params', name: 'reusable_params', label: 'Inputs', when: (v) => !v.loop },
      ]),
    ],
  },

  backgroundworkflow: {
    title: 'Background Workflow',
    summary: 'Queues another workflow to run detached from this request.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        { kind: 'workflowSearch', name: 'background_short_code', label: 'Select Workflow' },
        text('namespace', 'Namespace'),
      ]),
    ],
  },

  livecloudfunction: noFieldsTabbed('LiveCloud Function', 'Calls a LiveCloud function.'),

  /* ---- User management ---- */

  adduser: userBlockSchema('Add/Edit User', 'Creates or updates a tenant user.', [
    text('name', 'Name'),
    text('fedId', 'Federation ID'),
    idField('customerName', 'Group'),
    idField('systemRoleName', 'Global Role'),
    {
      kind: 'checkbox',
      name: 'sendmail',
      label: 'Send Welcome Mail?',
      trueValue: 'on',
      falseValue: '',
      checkboxLabel: 'Send a welcome email',
    },
  ]),
  getuser: userBlockSchema('Get User Details', 'Looks up one user by email.'),
  getuserlivespaces: userBlockSchema('Get User App List', 'Lists the apps a user belongs to.'),
  deactivateuser: userBlockSchema('Deactivate User', 'Disables a tenant user.'),
  addusertolivespace: userBlockSchema('Add User to App', 'Grants a user access to an app.', [
    text('livespace_shortcode', 'App'),
    text('livespaceroleName', 'App Role'),
  ]),
  removeuserfromlivespace: userBlockSchema(
    'Remove User from App',
    'Revokes a user’s access to an app.',
    [text('livespace_shortcode', 'App')],
  ),
  // The only user-management block whose template omits the Email row.
  getlivespacemembers: {
    title: 'Get App Members List',
    summary: 'Lists the members of an app.',
    layout: 'untabbed',
    groups: [group(undefined, [text('livespace_shortcode', 'App')])],
  },
  setlanding: userBlockSchema('Set User Landing Page', 'Chooses which dashboard a user lands on.', [
    text('livespace_shortcode', 'App'),
    text('dashboardShortCode', 'Dashboard'),
  ]),

  /* ---- Rover ---- */

  // customblockpopup.tpl relabels these two in the modal header.
  roverai: {
    title: 'AI Extract',
    summary: 'Runs a Rover extraction project against the current input.',
    layout: 'untabbed',
    groups: [
      group(undefined, [
        text('project', 'Select Project'),
        select(
          'searchsource',
          'Source',
          options(['mysource', 'My Source'], ['global', 'Global'], ['myinsight', 'My Insights']),
          { allowCustom: true },
        ),
      ]),
      group('Block Configuration', [
        textarea('question', 'Tasks', {
          rows: 8,
          required: true,
          placeholder:
            '- Extract the main sentiment and important keywords.\n- Extract key fields (e.g., name, date, address).',
        }),
        text('instructions', 'Instructions', { placeholder: 'Eg: List in the table format' }),
        text('goal', 'Goal', { placeholder: 'Eg: To create a executive summary' }),
      ]),
    ],
    defaults: { searchsource: 'mysource' },
  },

  /**
   * The five groups are the five tabs of the classic `agentNodeBlock.tpl`
   * dialog, in the same order and carrying the same fields — Model,
   * Instructions, Data access, Streaming & orchestration, Capabilities.
   */
  agentnode: {
    title: 'Agent Node',
    summary: 'Calls an LLM and lets it use tools, workflows and messaging skills to finish the task.',
    layout: 'untabbed',
    groups: [
      group('Model', [
        select(
          'provider',
          'LLM Provider',
          options(
            ['gemini', 'Google Gemini'],
            ['openai', 'OpenAI'],
            ['anthropic', 'Anthropic (Claude)'],
            ['on-premises', 'On-Premises (OpenAI Compatible)'],
          ),
          { required: true },
        ),
        text('model', 'Model', {
          required: true,
          placeholder: 'e.g. gemini-2.5-pro, gpt-4o, claude-sonnet-4',
        }),
        text('api_key', 'API Key / Base URL', {
          required: true,
          secret: true,
          placeholder: 'API key — or the base URL for an on-premises endpoint',
        }),
        text('temperature', 'Temperature', { half: true, placeholder: '0.7' }),
        text('max_tokens', 'Max output tokens', { half: true, placeholder: '4096' }),
      ]),

      group('Instructions', [
        textarea('system_prompt', 'System Prompt', {
          rows: 5,
          placeholder: 'You are a helpful assistant...',
          help: 'Schemas for the selected spreadsheets and guidance for the enabled skills are appended to this automatically.',
        }),
        textarea('prompt', 'Prompt', {
          rows: 8,
          required: true,
          placeholder: 'Enter the prompt. Use {variableName} to reference previous block outputs.',
          help: '{variableName} pulls a field from the previous block, {BlockLabel.field} from any earlier one. Unresolved braces are left as-is.',
        }),
      ]),

      group('Data access', [
        { kind: 'app', name: 'd_master_ssid', label: 'App' },
        {
          kind: 'spreadsheetCodes',
          name: 'ss_shortcodes',
          label: 'Spreadsheets',
          dependsOn: 'd_master_ssid',
          help: 'The agent can query exactly these sheets through query_database, with their schema injected into the prompt. A query naming any other table is refused.',
        },
      ]),

      group('Streaming & orchestration', [
        select('stream', 'Stream Response', options(['false', 'No'], ['true', 'Yes (real-time to UI)'])),
        text('identifier', 'Stream Identifier', {
          placeholder: 'e.g. guid_12345 (auto-set from trigger)',
          when: (v) => v.stream === 'true',
        }),
        text('identifier_value', 'Identifier Value', {
          placeholder: 'Target user GUID for streaming',
          when: (v) => v.stream === 'true',
        }),
        text('tags', 'Socket Event Tag', {
          placeholder: 'new_message',
          when: (v) => v.stream === 'true',
        }),
        select('is_sub_agent', 'Is Sub Agent', options(['false', 'False'], ['true', 'True']), {
          help: 'Turn on when a parent agent in another workflow calls this one as a sub-agent. Every streamed chunk is then tagged with the sub-agent ID so the UI can tell the agents apart.',
        }),
        text('sub_agent_id', 'Unique Sub-Agent ID', {
          placeholder: '{sub_agent_id}',
          when: (v) => v.is_sub_agent === 'true',
          help: 'The ID handed down by the parent agent node. Leave it as {sub_agent_id} to take whatever the parent passes in, or hard-code a value. Falls back to the block label.',
        }),
        text('sub_agent_label', 'Sub-Agent Display Name', {
          placeholder: 'e.g. Research Agent',
          when: (v) => v.is_sub_agent === 'true',
          help: 'Optional label sent with the stream for the UI to show. Defaults to the sub-agent ID.',
        }),
      ]),

      group('Capabilities', [
        {
          kind: 'skills',
          name: 'skills',
          label: 'Skills',
          help: 'Switch a skill on to give the agent a new capability, then configure it.',
        },
        {
          kind: 'json',
          name: 'tools',
          label: 'External Tools (JSON)',
          expect: 'array',
          rows: 6,
          placeholder:
            '[{"name":"get_weather","description":"Get current weather for a city","url":"https://api.weather.com/v1/current","method":"GET","parameters":{"type":"object","properties":{"city":{"type":"string","description":"City name"}},"required":["city"]},"auth":{"type":"bearer","token":"YOUR_KEY"}}]',
          help: 'JSON array of external API tools. Each needs name, description, url, method (GET/POST/PUT/DELETE) and parameters (JSON Schema); auth (bearer/basic/api_key) and headers are optional.',
        },
      ]),
    ],
    defaults: {
      provider: 'gemini',
      temperature: '0.7',
      max_tokens: '4096',
      stream: 'false',
      is_sub_agent: 'false',
      tags: 'new_message',
    },
  },

  roveragent: {
    title: 'AI Transform',
    summary: 'Runs a Rover transformation project against the current input.',
    layout: 'untabbed',
    groups: [
      group('Block Configuration', [
        text('question', 'Data'),
        textarea('purpose', 'Instructions', {
          rows: 8,
          placeholder: 'eg: Transform these detailed instructions into a simple checklist',
        }),
      ]),
    ],
  },
};

/**
 * `connectionMapping` is not an independent switch: the Connection Mapping tab
 * exists exactly when the classic dialog uses `tabbedBlockSettings.tpl`.
 */
Object.values(BLOCK_SCHEMAS).forEach((schema) => {
  schema.connectionMapping = schema.layout === 'tabbed';
});

/** Blocks whose settings UI is not yet ported; see the note in the dialog. */
export const UNPORTED_BLOCKS: Record<string, string> = {
  ruleengine:
    'Dashboard Rule builds its editor from the selected dashboard’s live object, filter and button inventory.',
  formrule:
    'Form Rule builds its editor from the selected form’s tab, group and field inventory.',
  ssadvdatafilter:
    'Spreadsheet Joined Filter needs the two-sheet column inventory to render its join and per-sheet filters.',
};

/**
 * The layout each unported block would have used, so its dialog still carries
 * the right tab strip. `ruleengine` and `formrule` get bespoke full-page
 * layouts (`layoutBlank.tpl` / `formLayout.tpl`); Joined Filter is untabbed.
 */
export const UNPORTED_LAYOUTS: Record<string, BlockSchema['layout']> = {
  ruleengine: 'plain',
  formrule: 'plain',
  ssadvdatafilter: 'untabbed',
};

export function schemaFor(blockType: string): BlockSchema | null {
  return BLOCK_SCHEMAS[blockType] || null;
}

/**
 * Layout for a block with no ported schema. Blocks the classic controller does
 * not list in `$templateArray` fall through to `$default`, the tabbed layout.
 */
export function layoutFor(blockType: string): BlockSchema['layout'] {
  return BLOCK_SCHEMAS[blockType]?.layout ?? UNPORTED_LAYOUTS[blockType] ?? 'tabbed';
}
