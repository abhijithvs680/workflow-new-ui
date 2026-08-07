# Workflow Debugger Changes

This file documents the changes made to the React app and legacy platform to synchronize functionality, improve performance, and fix critical bugs.

## 1. Unified API for Workflow Initialization (`Reactinfo.php`)
- **Problem**: The React app was making multiple fragmented calls to legacy endpoints (like `/workflow.customblockpopup`) to fetch properties for every single block, which was slow and inefficient.
- **Solution**: Created `v1-web-app/sys/controllers/workflow/Reactinfo.php`. This new JSON controller returns all workflow metadata, nodes, edges, and block properties in a single, highly optimized JSON response, significantly improving load times.

## 2. UI and Schema Alignment with Legacy Platform
- **Problem**: Several blocks in the React app were missing actual features or had additional non-legacy features compared to the legacy platform.
- **Solution**:
  - Ran a comprehensive audit script (`audit.js`) against all legacy `.tpl` files to map legacy fields to the React app's schemas.
  - Removed unwanted/extra instructions and fields from `registry.ts` to strictly align with legacy behavior.
  - Updated `BlockSettingsDialog.tsx` so the "Connection mapping" tab is always visible when appropriate, mirroring the legacy platform's behavior instead of disappearing unexpectedly.
- **Correction (see §5)**: the "Realtime / Disable" checkbox removed in this pass *is* part of the legacy UI —
  `blockComponents/spreadSheetSelect.tpl` renders it for Spreadsheet Data Insert, Data Update and Data
  Insert Or Update. It has been restored.

## 3. Unified API for Connection Mapping (`Reactconnection.php`)
- **Problem**: Clicking on connection mappings in the legacy system called `/workflow.connection` and `/workflow/connection.properties` to dynamically read target and source output fields to populate mapping dropdowns. The React app lacked this dynamic field discovery and forced users to manually type destination fields.
- **Solution**: 
  - Created `v1-web-app/sys/controllers/workflow/Reactconnection.php`, a new JSON controller acting as an alternative for these legacy READ operations.
  - It fetches and calculates the dynamic `output_fields` of both source and target blocks in real-time (e.g., dynamically fetching spreadsheet columns) and returns them as a structured JSON response.

## 4. React App Wiring & Bug Fixes
- **Dynamic Connection Mapping**: 
  - Added `fetchConnectionMappingDetails` to `workflowApi` (`api/workflow.ts`).
  - Wired `ConnectionMappingEditor.tsx` to call this endpoint on load. It now dynamically populates `<datalist>` dropdowns with the actual available fields from the source and target blocks, eliminating the need to guess or manually type mapping names.
- **Fixed Stale State Bug (Spreadsheet block resetting)**: 
  - **Issue**: Selecting an App and Spreadsheet, then clicking "Save", would immediately revert the dropdowns back to an "unselected" state visually, even though the data saved to the backend.
  - **Root Cause**: The `BlockSettingsDialog` was executing a manual `load()` after saving, which hydrated the form using a stale `node.data.block_properties` object from the original canvas boot cycle, wiping out the local changes visually.
  - **Fix**: Refactored `onSaved` callbacks in `BlockSettingsDialog.tsx` and `Studio.tsx`. The save operation now immediately updates the in-memory React Flow node data (`node.data.block_properties`) with the fresh payload without triggering a stale reload, keeping the UI perfectly in sync.

## 5. Dialog Layout Parity with the Legacy Block Popup

- **Problem**: every block dialog rendered the same invented shell — a `Settings` /
  `Connection mapping` / `Notes` tab strip, Description always on Notes, and fields grouped
  and ordered to taste. The legacy popup does none of that: `Customblockpopup::$templateArray`
  pairs each block type with **one of five layout templates**, and the layout decides the tab
  strip and where Label and Description sit.

- **Solution — `schema.ts` gains a `layout` discriminator**, mirroring that table:

  | `layout` | Legacy template | Tabs | Order |
  |---|---|---|---|
  | `tabbed` | `tabbedBlockSettings.tpl` | Block Settings · Connection Mapping · Notes | Label → fields → Description |
  | `untabbed` | `blockSettings.tpl` | none | Label → Description → divider → fields |
  | `plain` | `dateLayout` / `mathLayout` / `stringLayout` / `layoutBlank` / `formLayout` | none | Label → row set (no Description) |

  `connectionMapping` is no longer an independent flag — the Connection Mapping tab exists
  exactly when the block uses the tabbed layout, which is what the platform does. That makes
  `sendmail`, `livespace`, the four spreadsheet write blocks, and the three blocks absent from
  `$templateArray` (`clearoutput`, `zipfiles`, `livecloudfunction`, which fall through to
  `$default`) tabbed, and everything else untabbed or plain.

- **Advanced tab**: previously declared in the `Tab` union but never listed in the tab strip,
  so it was unreachable and the three unported blocks could not be edited at all. It is now
  rendered for exactly the blocks that need it — those with no ported schema, plus
  `ruleengine`, `formrule` and `ssadvdatafilter`.

### Field-level corrections (`registry.ts`)

Every block was re-derived from its `.tpl`. The substantive fixes:

- **Execute Workflow** — was NameSpace / *Loop over* (a text box) / Extra Parameters / Inputs
  under a bogus tab strip. Legacy is untabbed: **NameSpace → Extra Parameters → Enable Loop
  (a `1`/`0` checkbox) → Inputs**, with the reusable input grid hidden while Enable Loop is on.
- **Spreadsheet write blocks** — `ssMultiFilter.tpl` gates sorting, paging, distinct, aliases
  and the large-data switches behind `{if $blockType eq 'ssdatafilter'}`. Data Update and Data
  Insert Or Update were showing all of them; they now show **filter rows only**. Spreadsheet
  Filter keeps them, in the template's order, under an **Advanced Settings** heading:
  Enable for large data · Row count only · Limit From · Limit To · Column Alias ·
  Distinct Column · Sort Order.
- **Realtime toggle restored** — `disable_realtime` ("Realtime / Disable") for Data Insert,
  Data Update and Data Insert Or Update, in its legacy position directly under Data source.
  Bulk Data Insert correctly does not get it.
- **Date** — the row set was wrong end to end. `operator` is `add` / `sub` / `diff` / `comp`
  (not `+` / `−`), `time` is a **With time** checkbox storing `"true"`/`"false"` (not a
  day/month/year unit picker), and `informat` / `outformat` are pickers over the template's
  format lists. Order is now Variable · With time · Date 1 · Action · Interval ·
  Input Format · Output Format.
- **String** — `type` values were invented (`uppercase`, `trim`, `split`, …). They are now the
  eighteen the template ships: `regE`, `regM`, `regR`, `upper`, `lower`, `strlen`, `implode`,
  `urlencode`, `urldecode`, `unicodeEscape`, `unicodeUnescape`, `compareString`, `explode`,
  `substrcount`, `stringreplace`, `substr`, `ltrim`, `rtrim`. Order: Variable · Action ·
  Pattern · Input · Offset.
- **Math** — `math_input` is a textarea, as in `mathLayout.tpl`.
- **AI Extract / AI Transform** — dropped the `rover_url` and `notify_type` fields the
  templates comment out. AI Extract is Select Project · Source, then a **Block Configuration**
  group with Tasks (`question`) · Instructions · Goal; AI Transform is Block Configuration
  with Data (`question`) · Instructions (`purpose`).
- **Convert To Spreadsheet** — `$templateArray` points it at `livespaceBlock.tpl`, so it is an
  App + **Documents** pair, not an App + Spreadsheet pair.
- **Zip Files / LiveCloud Function / Clear Output** — absent from `$templateArray`, so legacy
  gives them no block-specific fields at all. The invented `lid`/`cid`/`filename` and
  `namespace` inputs are gone; they open tabbed, with the Advanced tab still available.
- Labels and option lists across the remaining blocks now match the templates verbatim
  ("Header Status Code", "Json Data", "Limit From", "Send Welcome Mail?", "Download to Client",
  `desc`/`asc` for Array Extract, and so on).

## 6. Connection Mapping Wired to `Reactconnection.php`

- **The endpoint could never match a block.** It searched `w_objects` for `$ObjBlock['blockId']`
  while loading the *stored* document, where `Save.php` writes that key as `id` — so every call
  returned "Source or target block not found." It now matches either key.
- **It read the wrong source.** `Connection\Executeaction` resolves both blocks from
  `session('workflow')`, so the field lists reflect edits made since the last commit. The
  controller now searches the session first and falls back to Mongo when the session holds no
  such workflow (or not that target).
- **`output_fields` shape.** `executeaction.tpl` renders `{$fieldnames}` — the array's *values*.
  The React side was reading `Object.keys(...)`. The controller now returns a de-duplicated,
  re-indexed list and the editor consumes it directly.
- **New response fields** so the UI can pick the same view the classic dialog does:
  `sourceType`, `targetType`, `connectionAction` (`SENDMAIL` for a Send Mail target, `READ`
  otherwise), a normalised `fieldMapping`, and `allowedEmails` (the `AllowedEmails` constant
  `connection/sendmail.tpl` uses to populate Mail From).
- **`ConnectionMappingEditor.tsx` rebuilt** around those two views:
  - *READ* — a **Source ⇄ Target** table. The Target cell is a `<select>` over the target
    block's `output_fields`, exactly as the template renders it, and degrades to a free text
    box when the target resolves its sheet by shortcode (`dynamic_flag == "true"`) or exposes
    no fields. Previously both sides were free text with a mis-shaped `{blockId.field}` datalist.
  - *SENDMAIL* — the fixed row set from `connection/sendmail.tpl` (Mail From · From Name ·
    Alias Email · Alias Name · Mail To · Mail Subject · Mail Bcc · Mail Cc · File Attachment ·
    Mail Content), destinations not editable, rows not addable. Mail From is a picker over
    `allowedEmails`; Mail Content is a textarea. Saving always posts the full set, so clearing
    a field clears it on the connection.
  - The Source cell uses the app's `{Block.field}` autosuggestion instead of an ad-hoc datalist.

### Why the mapping always rendered empty

`connectionPropInsert` writes `field-mapping` to **two** places — the connection's
`properties` *and* the target block's `properties`. Only the second survives:
`Save.php` builds each Mongo connection from `id` / `source` / `target` /
`target_yes` / `target_no` and never copies `properties`, and the branch that would
have moved it under the target block is commented out (`Save.php`, "Move connection
action Properties under Target block").

The canvas was seeding the editor from `connectionProps.get(edge.id)` — the connection
copy — which `Reactinfo.php` reads back from Mongo, where it is always absent. Every
block therefore opened with a blank mapping, and a saved mapping vanished on reload.

Fixed on both sides:
- `BlockSettingsDialog` seeds from the **target block's** `properties`, falling back to
  the connection's for a mapping that only exists in the current session.
- `ConnectionMappingEditor` re-seeds from `Reactconnection.php`'s `fieldMapping` once the
  fetch lands — the authoritative copy, session-aware — but only while the form is still
  pristine, so it can never overwrite an edit in progress.

## 7. Workflow Settings — parity with `wfsettings.tpl`

The drawer's arrangement already matched (action box, Versions + Create, View history,
Add to category, Connect to an App, Reusable). Three behavioural gaps remained:

- **Missing action.** The classic action box has **five** items; the drawer had four.
  Added **Copy workflow Short Code** (`icon-copy-short-code-link`), including the
  `"Short code has copied to clipboard"` confirmation.
- **JSON viewer left the app.** Classic loads `/workflow.settings/{short_code}/json` into
  an ajax modal (`data-class="studioModel wfjson-model"`); the drawer opened it with
  `target="_blank"`. It now renders in a modal, with Copy.
  `settings/view_json.tpl` returns markup that hands the document to
  `$("#json-preview").JSONView(…)` followed by a `<style>` block, so the literal is pulled
  out with `extractJsonAfter` from that marker — scanning for outermost braces would run
  past the data and into the CSS.
- **Version stamps.** Classic renders `moment.unix(…).format("MM-DD-YYYY HH:mm:ss")`; the
  drawer used a locale short-month format. Both the drawer and the version canvas now share
  `lib/versions.ts`.

## 8. Version canvas inside the new UI

Classic renders each version stamp as `<a href="#workflow.versiondebugger/{id}" target="_blank">`,
which leaves the React app for the jsPlumb page. In the drawer the stamp was not even a
link. It now opens the version **on the React canvas**.

- **`Reactinfo.php`** gained `/workflow.reactinfo/version/{versionId}`, mirroring
  `Versiondebugger` (the classic `Debugger` with `Workflowversion` swapped in for
  `Workflow`). The stored `w_objects` / `connection` are the same shape, so block and
  connection formatting was extracted into `formatBlocks()` / `formatConnections()` and is
  shared by both paths. It also returns `isVersion`, `versionCreatedAt`, `versionNote`,
  `parentWorkflowId` and `parentName`.
- **Routing** uses `?version=<id>` on the existing path rather than a `/version/<id>`
  segment. The build ships no `.htaccess` (`scripts/deploy.mjs` warns about this), so an
  extra path segment would fall through to the PHP router and 404 on reload.
- **`loadWorkflowVersion`** skips the shell page entirely: a version is read-only, so it
  needs neither the palette nor the session re-seed — and skipping it keeps the viewer from
  touching the parent workflow's session.
- **Read-only.** `Studio` wraps `setEditing` so it can never leave `false` for a version,
  and `Toolbar` renders a version bar — name, `Version` pill, stamp, note, **Back to
  workflow** — with no Edit/Save/Run/Arrange/Settings, matching the classic version page.
- `versionHref` lives in `lib/versions.ts`, not `App.tsx`, so
  `App → Studio → WorkflowSettings` does not import back into `App`.

### Deployment note

The running container mounts `Vizru-Docker/receiver/volumes/web/app-live/v1-web-app`
(see `docker-compose.yaml`), **not** `vizru_controller/Vizru/v1-web-app`. That docroot is a
newer branch — it carries `Studio.php`, `Aichat.php`, `AgentNodeBlock.php` and
`RelationalFilterBlock.php`. `Block.php` differs only by those new block-type constants, and
`SpreadsheetOperationsBlock::getBlockInfo()`/`getColHeaders()` are byte-identical, so
`output_fields` behaves the same on both. PHP changes must be copied into the Docker docroot
to take effect; `opcache.validate_timestamps` is on with a 2s revalidate, so no restart is
needed.
