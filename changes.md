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

## 9. Dialog arrangement, drawer and control theme

- **Fields are one per row again.** `.viz-field-grid` used
  `repeat(auto-fit, minmax(280px, 1fr))`, so fields reflowed into two or three
  columns and lost the order the templates define — this is the "collapsed"
  arrangement. Every classic block form is a `<table>` of full-width
  `label | control` rows, so the grid is now single-column, with an opt-in
  `half` flag for the only places a template pairs two controls on one line:
  the two Advanced Settings switches and `Limit From` / `Limit To`.
- **Filter rows** follow `ssMultiFilter.tpl` — inline
  `Filter Column : [key] [op] Filter Value : [value] [−]` with one right-aligned
  **Add** underneath, instead of a header row plus an "Add filter" link.
- **Sort** now shows the chips ("Sort Order") first, then
  `Sort Column : [input] (•) ASC ( ) DESC [Add]`, which is the template's order;
  it previously had the input above the chips and a dropdown instead of radios.
- **Column Alias** regained its **Click to Generate** action, filling the box
  with `column as column` for every column of the selected sheet, as
  `#ColumnAlias` does.
- **Dialogs are pinned**, not centred — see §8 — so the header and tabs stay put
  as you move between blocks.
- **Settings is a right-docked drawer** at full canvas height (`placement="right"`
  on `Modal`), matching the classic `viz-custom-sidebar` rather than a centred box.
- **One dropdown appearance.** Selects now share a single inline chevron, height,
  hover, focus and disabled treatment; the pill-shaped `is-rounded` input/select
  in the settings drawer were dropped for the standard control.
  This also fixed a latent bug: the shared disabled rule used the `background`
  shorthand, which reset `background-repeat/size/position` and **tiled the caret
  across the whole control** — it now sets `background-color` only.

Help text was removed throughout: field-level `help` strings, the Unique
Validator hint, the "no fields" paragraphs, the Advanced-tab blurb, the
unported-block explanation, and the Create-version / Reusable subtitles. What
remains is state ("Connect an incoming block to map fields", "Loading…") and
errors.

## 10. Canvas silhouettes and a themed dropdown

**Block families now have their own outline.** Conditions were the only shape on
the canvas (the diamond); everything else was the same 220×80 rounded card
differing only in colour. Each family now reads at a glance:

| Family | Silhouette |
|---|---|
| trigger / entry | left pill — the flow starts here |
| output | right pill — the flow ends here |
| workflow | thick rules on both edges — the "predefined process" symbol |
| sheet | square corners + a top rule — stored data |
| file | folded bottom-left corner — a document |
| math | extra-round | 
| filter | left stripe — a gate on the path |
| ai | alternating corners |
| condition | diamond (unchanged) |

Shape comes from `border-radius` and real borders, never `clip-path` or inset
`box-shadow`. `clip-path` would cut off the border, drop shadow and the
debug-active halo, all painted outside the box; an inset `box-shadow` accent
would outrank that halo, which is declared earlier with the same specificity.
Verified the halo still resolves on the bordered skins.

**Native selects replaced by a themed listbox** (`components/ui/Select`). A
native `<select>` draws its open list as OS chrome — a blue Windows popup — so
the expanded state ignored the theme no matter how the closed control was
styled. The new component keeps the closed appearance identical (same 32px
height, chevron and focus ring) and renders the list from ordinary elements, so
the panel, hover and selected rows use `--surface-raised`, `--primary-050` and
`--primary-700`.

The panel is portalled to `document.body` and positioned from the trigger's
viewport rect, flipping above when it will not fit below: React Flow's
transformed panes create containing blocks that would clip or mis-place an
absolutely positioned child on the canvas, and a dialog's scrolling body would
crop it. It also keeps the "value no longer in the list still round-trips"
behaviour that `withCurrent` used to provide, which is now deleted.

Swapped everywhere: schema selects, app/spreadsheet/document pickers, row-set
cells, the filter operator, the connection-mapping target and Mail From, the
settings drawer's app and hour pickers, and the recent-logs page size.

## 11. Corporate design-system pass

A visual-layer-only refinement of the existing light theme — no TSX structure
changes, no new endpoints. `index.css` only.

**Tokens.** Added a type scale (11 / 12.5 / 14 / 16 / 20), a 4px spacing scale,
and a single `--focus-ring`. Elevation was pulled back — enterprise surfaces
should read as paper on a desk, not floating glass — so each step is a tight
ambient shadow (`0 2px 8px / 8%`) rather than a large diffuse one
(`0 4px 14px / 10%`), and corner radii dropped a step.

**Typography.** Every `font-size` now resolves to the scale; there were twelve
ad-hoc sizes between 10px and 19px across 59 declarations. The base stays at
~13px so control heights and the 220px node width are unaffected — this is a
visual pass, not a density change.

**Contrast.** The ink ramp was re-cut so every step used for text clears WCAG AA
on `--surface`. `--ink-400` was `#8d95a3` at **3.0:1** — below AA, and it is the
placeholder colour. Measured on rendered elements:

| Token | Ratio |
|---|---|
| ink-900 / 800 / 700 | 18.6 · 15.5 · 12.1 |
| ink-600 / 500 / 400 | 8.4 · 5.9 · **4.5** |
| ink-300 | 2.6 — strokes and disabled glyphs only, never text |

**Node palette.** Entry and output keep the classic dark navy; they are the
terminals and reading them as solid blocks is the point. Every other family
moved to a plain white surface — a canvas of pastel tints becomes a rainbow at
any real workflow size. Family identity is carried by one saturated accent
instead: the icon badge, plus the silhouette and edge rule from §10. Badge
colours were darkened so white glyphs clear AA on all of them (lowest 4.76:1),
and node label/type measure 18.6:1 / 5.9:1 on light families and 12.1:1 / 4.9:1
on the dark terminals.

## 12. n8n design system (light)

Re-based the UI on n8n's light design language. **Block config modals were not
touched** — no diff in `registry.ts`, `schema.ts` or `BlockSettingsDialog.tsx`,
and none of the field-grid / half-row / filter-row / sort-row rules changed, so
the legacy field arrangement from §7–§9 is intact.

**Tokens.** Ink ramp re-cut onto n8n's text scale (`#525252` → `#909399`),
foreground hairlines to `#dbdfe7`, canvas to `#fafafa` with a 16px dot grid,
radii to 4 / 6 / 8, and near-flat elevation. The platform primary `#003EAA` is
**kept** for actions rather than adopting n8n's brand coral — swapping a
product's brand colour for a competitor's seemed like the wrong default, and
the reference screenshot is neutral anyway. Say the word to switch.

**Canvas.** Nodes are now n8n-style: a 96×96 white square holding only the
glyph, with the name and subtitle rendered *below* the card. The caption is
absolutely positioned so the React Flow node box stays 96×96 — otherwise the
left/right handles would centre on the card plus its text. Triggers round their
leading edge and carry the coral lightning marker; handles are small grey dots;
an unconnected output gets n8n's persistent lead-line-plus-square stub.
Condition nodes keep the same footprint and stack **true** / **false** on the
right edge, which is both what n8n does and what stops the second label
colliding with the caption underneath.

The per-family silhouettes from §10 are gone: n8n uses one shape and lets the
glyph carry identity, so family colour moved onto the icon and the tinted cards
went white.

**Icon badges.** Moving the family colour onto the glyph made every icon vanish:
the platform ships its block icons as **white** theme SVGs, drawn to sit on a
coloured badge. So the family colour lives on a 46px rounded badge behind the
glyph instead — which is also how n8n reads, a colourful mark centred in a white
square. White-on-badge measures 5.0–8.9:1.

**Condition.** Back to a diamond, wearing the current theme: flat teal fill, no
gradient or drop shadow, on a transparent 96×96 card so it still lines up in a
row with every other node.

**Settings drawer.** Weights dropped from 700 to 600, the action row moved off
the monospace face onto `--font`, the history strip lightened, and
`font-family: var(--font)` pinned on `.viz-modal` so no part of a portalled
dialog can fall back to a UA font.

**Contrast.** Re-measured on rendered elements; three failures found and fixed:
the node subtitle was on `--ink-300` at **2.08:1** (violating the "never for
text" rule that token documents), the teal glyph was **3.43:1**, and the branch
labels **4.31:1** on the canvas tint. Now: label 7.5 · subtitle 5.1 ·
branch labels 5.3 · glyphs 5.1–8.9.

## 13. Hosting at /workflow, hash routing, and the #/list route

**Hosting.** The app now lives at `v1-web-app/workflow/`, whose `.htaccess`
rewrites every non-file request to `dist/index.html`. Vite's build `base` is
`/workflow/dist/` so asset URLs are absolute — a relative base would resolve
against whatever route the user landed on. Verified in the built `index.html`:
all four assets emit as `/workflow/dist/assets/...`.

**Routing is hash-based** (`lib/routes.ts`):

| Route | Shows |
|---|---|
| `#/list` | workflow list (also the landing route) |
| `#/debugger/<id-or-shortCode>` | the canvas |
| `#/debugger/<id>?version=<vid>` | read-only canvas for a saved version |

Apache never sees the hash, so every route reloads cleanly and adding one needs
no server change. All link builders (`Toolbar`, `Studio`'s open-child,
`WorkflowSettings`' version links, the open form) now go through
`debuggerHref` / `versionHref` rather than hand-built paths.

The dev proxy needed rethinking: with `APP_BASE` now `/workflow/`, "starts with
the base" no longer separates app from platform. Platform endpoints under that
prefix are all `<name>.<action>` in the first segment (`log.debugdata`,
`connection.properties`), so `isPlatformPath()` proxies those and serves
everything else — the shell, `dist/`, and Vite's `@vite` / `src` dev routes —
locally.

**`deploy.mjs`** now replaces only `workflow/dist/` and no longer lifts
`index.html` to the directory root. It deliberately does *not* wipe
`/workflow/`: the `.htaccess` that makes the layout work lives there and is
maintained by hand. It warns, with the expected rules, when that file is missing.

## 14. Workflow list (`#/list`)

Replaces the classic `workflow.html`, fed by the existing `workflow.all`
controller. Two properties of that endpoint drove the design:

- It reads filters from `php://input`, so the request needs a **real JSON body**
  — a form-encoded post arrives as `null`. Added `postJsonBody` for this; the
  reply is bare JSON (`echo` + `exit`), with no platform envelope.
- **It has no pagination.** It returns every workflow in one array, doing a tag
  lookup plus one or two user lookups per row on the way.

**Arrangement** follows the classic page: a "List by app" rail on the left
(Recent Workflows first, then one entry per connected app with a count), and a
single-column list of full-width rows on the right — name on the left, chevron
on the right, with the row's actions and a floating last-action card (Last
action by / date / Owner / short code) revealed on hover, plus a create FAB.
The styling is the new UI's, not the classic magenta. App buckets are derived
from the rows already loaded rather than a second request, since the response
carries each workflow's connected apps.

The hover card is portalled and fixed-positioned from the row's rect: the scroll
container clips on both axes, so a card rendered inside a row would be cut off
near the edges — and it flips above the row when it would run off the bottom of
the viewport.

Delete is deliberately **not** wired. The response carries a signed `DeleteUrl`
into the generic datagrid action endpoint (`datatable.an/delete/` with a
`doListAction` callback), whose POST shape — the `$pAn` / `$pSeln` selection
contract — would have been guesswork. Shipping an untested destructive call was
not worth it; the row actions are open-in-new-tab and copy-short-code.

So the response is fetched once and everything after — search, filter, sort — is
client-side, and the list is **windowed**: a full-height spacer drives the
scrollbar while only the rows in the scrollport (plus 8 overscan) are rendered.
The DOM stays flat regardless of tenant size — measured 27–35 rows at 50, 1 000,
5 000 and 25 000 workflows, with the spacer at 1.1M px for the largest, well
inside browser limits.

## 15. `workflow.save` — "Error parsing ObjectId string"

Saving failed with `Error parsing ObjectId string: newsubagent6a6c4c28390bc`.
That is a **short code** reaching a field that requires a Mongo id, and the
chain is:

1. `Debugger.php` sets `$workflowId = $param[0]` — the raw URL parameter — so
   opening `/workflow.debugger/<shortCode>` renders
   `vizWorkflow.id = "<shortCode>"`.
2. The canvas reads that into `boot.workflowId` and posts it to `workflow.save`
   as `workflow_id`.
3. `Save.php` decides whether it has an id by **length**:
   `if (strlen($savedWrkflwid) >= 24)` before `new ObjectId($savedWrkflwid)`.
   `newsubagent6a6c4c28390bc` is exactly 24 characters, so it passes the guard
   and the constructor throws.

Both URL forms still work — a short code, an id, or an execution log id all
open. What changed is that the boot payload now carries **both** identifiers and
each call site uses the one its controller expects:

| Endpoint | Expects |
|---|---|
| `workflow.save` | **id** — `new ObjectId($workflow_id)` |
| `workflow.savesession`, `workflow.reactconnection` | **id** — these key into the PHP session bucket |
| `workflow.version` | **short code** (`short_code`) |
| `workflow.settings/{sc}/json` | **short code** — `loadWorkflowByShortcode`, no id fallback |
| `workflow.debugger`, `workflow.reactinfo`, `workflow.init`, `workflow.settings/{wid}`, `workflow.tags` | either |

Fixed on the client, in two places:

- **`loadWorkflow` now normalises to the Mongo id.** `Reactinfo` resolves either
  form to `(string) $wrkflwObj['_id']`, so the id is taken from there; when it
  differs from the parameter the shell is re-fetched with it, because
  `Debugger.php` also seeds the PHP session under whatever param it was given
  (`session_set('workflow[' . $workflowId . ']', '')`) and every `savesession`
  write is keyed by the id the canvas posts. That bucket holds the workflow's
  **existing** blocks, so writing under a different key would silently drop
  every edit to them at save time — which is why the re-fetch is not optional.
  Detection uses `/^[a-f0-9]{24}$/`; length alone cannot tell the two apart,
  which is the whole bug.
- **The `#/list` rows link by `r.id`**, not `r.shortCode || r.id`, so the common
  path never puts a short code in the URL to begin with.

The underlying `Save.php` length check is still fragile for anything that
reaches it by another route; hardening it is a PHP change and was left alone.

## 16. Block clipboard, skeletons, scrollbars

**No legacy change.** Everything below uses endpoints the platform already
exposes; `git status` on `v1-web-app` is clean.

**Copy / paste across workflows.** The block action is now **Copy**, not Clone,
and writes to the classic shared clipboard —
`/workflow.favourite {mode:'insert'|'list'|'delete', type:'clipboard'}`. An
entry is a *reference* (`{source, obj_id}`) to a block still living in its
origin workflow, which is why pasting can carry its properties across:
`objectInsert` with `blockOptr=clone`, `blockParent`, `clone_wf_id` — the shape
`session.addBlock` already spoke.

Copying with a multi-block selection also records, per entry, its offset from
the selection's top-left and the `obj_id`s it feeds **inside the selection**.
Paste then inserts the blocks, maps old ids to new, and replays those links with
`connectionInsert`, so the sub-graph is rebuilt rather than dropped as loose
blocks. Links whose other end was not copied are deliberately not recorded —
there is nothing to reconnect them to. Verified on a 5-node graph: relative
offsets preserved, all three internal links rebuilt with the right branch
(plain / yes / no), and the edge to the unselected block dropped.

The palette gained a **Clipboard** group, as the classic one has: paste a single
entry, "Paste all N blocks (with connections)", or Clear all. It is fetched per
canvas rather than carried in the boot payload, because the clipboard is shared
across workflows.

Note the platform's own staleness rule applies: `Favourite::listClipboard()`
drops entries whose source block no longer exists, so deleting a copied block
empties it from the clipboard.

**Skeletons** replace the spinners on both routes — a canvas placeholder with
block-shaped tiles, and a list placeholder with rail and row shapes — so the
layout does not jump when data lands.

**Scrollbars** are thin (8px), transparent-tracked and light-thumbed app-wide,
with a lighter thumb inside the dark debug dock and 6px on the palette, rail and
dropdown panels.

**"List by app"** is a plain heading again; the collapse toggle is gone.

## 17. Endpoint contract fixes

**`workflow.autosuggestion` was silently returning nothing.** Three mismatches,
none of them id-vs-shortcode:

1. We posted `workflow_id`; the controller reads `post('workflowId')`. The
   camelCase name is what it wants, so the id arrived empty and the
   `array_key_exists($workflowId, $wrkflow_session)` guard never passed.
2. It answers for **one block** (`if ($con['blockId'] == $block_id)`) and needs
   `blockid`, which we never sent. The canvas now fans out one call per block,
   restricted to the ten types the controller actually handles (`setvariable`,
   `ssdatafilter`, `date`, `math`, `string`, `arrayextract`, `getfiles`,
   `getuser`, `ssadvdatafilter`, `ssautoincrementcol`) — every other type is a
   guaranteed empty round-trip.
3. It `echo`es a bare JSON array and exits. We were reading `data.Result`, which
   does not exist on that reply.

Audited the other endpoints for the same class of bug: `workflow.tags`
(`mode`/`tag_type`/`obj_id`), `workflow.reusables` (`inputdata`/`key`),
`workflow.version` (`type`/`short_code`/`vid`/`note`) and `workflow.favourite`
(`mode`/`type`/`data`) all match what their controllers read.

**`workflow.all` no longer sends a body** when no filter is set — the controller
only does `isset()` checks on the decoded input.

**`/workflow.debugger/{id}` is still required.** `Debugger.php:225-242` is the
only code that loads a workflow into the PHP session
(`$wrkflow_session[$workflowId] = $workflowObj`). `Reactinfo` reads Mongo without
touching the session, and `Savesession` only mutates a bucket that already
exists. Drop the shell fetch and `savesession` writes would land in an empty
bucket — `workflow.save` would then commit a workflow with only the newly added
blocks — plus autosuggestion and the palette would go dark.

**Clipboard is one block per copy.** `Favourite.php` does
`$data = json_decode($data)[0]`, keeping only the first element of the posted
array, so a multi-block copy could never have persisted through it. Copy now
sends exactly one entry, the "Paste all" control is gone, and the group is
styled as a normal palette group with its own heading and a Clear all footer.

### Deployment note

The running container mounts `Vizru-Docker/receiver/volumes/web/app-live/v1-web-app`
(see `docker-compose.yaml`), **not** `vizru_controller/Vizru/v1-web-app`. That docroot is a
newer branch — it carries `Studio.php`, `Aichat.php`, `AgentNodeBlock.php` and
`RelationalFilterBlock.php`. `Block.php` differs only by those new block-type constants, and
`SpreadsheetOperationsBlock::getBlockInfo()`/`getColHeaders()` are byte-identical, so
`output_fields` behaves the same on both. PHP changes must be copied into the Docker docroot
to take effect; `opcache.validate_timestamps` is on with a 2s revalidate, so no restart is
needed.
