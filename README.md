# Workflow Studio — standalone canvas

A React + Vite + TypeScript rebuild of the Vizru Workflow Studio (React Flow
canvas), deployed as **static files only**. It reuses the production platform's
existing controllers, endpoints and workflow JSON format — no PHP is added or
modified.

```
https://<host>/workflow/debugger/#/<workflowId-or-shortCode>
https://<host>/workflow/debugger/#/<executionLogId>
```

Authentication is the platform session cookie. Open the app in a browser that
is already signed in to the platform; every request is `same-origin`.

---

## Why no server changes are needed

Apache's rewrite in `v1-web-app/.htaccess` only forwards to `index.php` when the
request does **not** resolve to a real file or directory:

```apache
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ index.php/$1 [L,QSA]
```

Dropping the build into `v1-web-app/workflow/debugger/` therefore serves
`index.html` and its assets directly. Routing is hash-based (`#/<id>`) for the
same reason — any deeper *path* would fall through into the PHP router.

## Bootstrapping without a `Studio.php`

Production has no `/workflow.studio` controller and no JSON graph endpoint, so
the canvas assembles its boot payload from three pages the **classic canvas
already requests** (`src/api/bootstrap.ts`):

| Request | Yields |
|---|---|
| `GET /workflow.debugger/{idOrShortCode}` | resolved Mongo id, name, short code, palette (`window.w_leftBlockArray`) |
| `GET /workflow.debugger/{workflowId}/isChild/` | blocks (position, type, icon, label, description) and connections, from `content.tpl` |
| `GET /workflow.settings/{shortCode}/json` | full `w_objects` incl. `block_properties` (optional; degrades the "configured" badge only) |

The first two also **re-seed the PHP `workflow` session**, which every
`/workflow.savesession` write depends on. That side effect is the reason the app
fetches pages rather than something leaner.

## Endpoints used

All of these already exist in the production platform.

| Endpoint | Purpose |
|---|---|
| `POST /workflow.savesession` | `objectInsert` · `objectDelete` · `objectDrag` · `connectionInsert` · `connectionDelete` · `blkNameUpdate` · `changeBlockIcon` · `customblockPropInsert` · `connectionPropInsert` |
| `POST /workflow.save` | commit the session to Mongo |
| `POST /workflow.init/{id}` | run the workflow |
| `GET /workflow/log.debugdata/{logId}` | execution trace |
| `POST /workflow.settings/{id}` | recent logs (`type=log`), runtime settings (`type=save`) |
| `GET /workflow.jsoninfo/{wfId}/{blockId}` | current `block_properties` for one block |
| `POST /workflow.version` · `/workflow.tags` · `/workflow.reusables` | settings drawer |
| `POST /workflow.livespacelist` · `/ls/livespace.sslist/{lid}` · `/ls/livespace.ajaxdoclist/{lid}` · `/ls/livespace/spreadsheet.columns/{ss}` · `/workflow.search` | dialog option sources |

### Two invariants worth knowing

**Coordinates are swapped.** The session stores `xPos` as CSS *top* and `yPos`
as CSS *left*. React Flow uses `{x: left, y: top}`, so `RF.x = yPos` and
`RF.y = xPos`. The conversion exists in exactly one place, `graph/convert.ts`.
Getting it wrong transposes whole diagrams.

**`customblockPropInsert` replaces, it does not merge.** Any `block_properties`
key not echoed back is deleted. `BlockSettingsDialog` therefore seeds every save
from the stored document and overlays the form on top, so unknown or
not-yet-ported keys survive untouched.

## Block settings

Every dialog is native React — no legacy Smarty markup is injected. Forms are
declared in `src/components/settings/registry.ts` against the **platform's own
input names**, taken from each block's `.tpl`. That name match is the whole
compatibility contract: a block configured here is byte-identical to one
configured in the classic dialog.

A verified example (Spreadsheet Filter):

```
label, d_master_ssid, s_master_ssid, dynamic_flag, ss_short_code,
filters[email], filter_operators[email], sort_by[0][sort_column],
sort_by[0][sort_order], limit_to, limit_offset, distinct_column,
big_data, row_count, alias_column, description, blockType
```

**Ported natively:** Get Parameters · Conditional · Unique Validator · Set
Variable · Clear Output · Array Extract · Custom Output · Return · Download as
File · Realtime Push · Send Mail · Notification · Generic GET/POST · Twilio ·
Retarus Fax/SMS · Spreadsheet Filter / Delete Row / Increment Column / Insert /
Bulk Insert / Update / Insert-or-Update · Convert To Spreadsheet · App Document
· all File blocks · Zip Files · Google OCR · Date · Math · String · Execute
Workflow · Background Workflow · LiveCloud Function · all User Management
blocks · AI Extract · AI Transform.

**Not ported (editable via the Advanced tab):** Dashboard Rule (`ruleengine`),
Form Rule (`formrule`), Spreadsheet Joined Filter (`ssadvdatafilter`). Their
editors are generated from live dashboard/form/two-sheet inventories that the
server assembles per-request; `layoutBlank.tpl` alone is ~1,700 lines. These
blocks open, display, save and round-trip correctly — their properties are
edited as JSON on the **Advanced** tab, and are preserved byte-for-byte when the
block is saved from any other tab. Use the classic dialog for a guided edit.

Each dialog's tab strip and field order mirror the layout template
`Customblockpopup::$templateArray` pairs the block with — `tabbedBlockSettings.tpl`
(Block Settings · Connection Mapping · Notes), `blockSettings.tpl` (no tabs;
Label, Description, then fields), or one of the bespoke Date/Math/String/rule
layouts (no tabs, no Description). Blocks the controller does not list fall
through to the tabbed layout with no block-specific fields, which is why Zip
Files, LiveCloud Function and Clear Output show only Label, Description and the
mapping tab.

Blocks with no ported editor — the three above plus any type added later — also
get an **Advanced** tab exposing raw `block_properties`, so no setting is ever
unreachable.

## Features

Load/save · React Flow canvas · drag-and-drop from the palette · click-to-add ·
"add next" auto-connect · connect by drag or click-to-click · edit/delete nodes
and edges · clone · open child workflow · zoom/pan/minimap/fit · selection ·
connection validation · dagre auto-arrange · run with input parameters · debug
dock (taken path, per-block input/output, JSON highlighting, prev/next,
resize, maximize) · recent logs · workflow settings (logging, schedule,
versions) · read-only until **Edit** · unsaved-changes guard.

**Validation** (before anything reaches the session): no self-loops, no incoming
edge on an entry block, no duplicate edges, one outgoing edge per non-condition
block, one edge per condition branch.

**Keyboard:** `Ctrl/Cmd+S` save (or unlock editing) · `Del`/`Backspace` delete
selection · `B` blocks · `F` fit · `Enter` edit selected block · `Esc` cancel
pending connection / close.

## Not included, by design

AI workflow chat (`/workflow.aichat`), Agent Node, Relational Execute, and the
version-debugger canvas are development-branch features with no production
controller. They are deliberately absent.

## Development

```bash
npm install
cp .env.example .env      # point VIZRU_PLATFORM_URL at your platform
npm run dev               # http://localhost:5180/workflow/debugger/#/<id>
```

The dev server proxies `/workflow.*`, `/workflow/`, `/ls/`, `/sys/`,
`/ui-themes/`, `/data/` and `/api/` to the platform with `secure: false`, so the
browser stays same-origin and reuses your session cookie. Sign in to the
platform on the same host first.

## Build and deploy

```bash
npm run build
npm run deploy -- ../Vizru-Docker/receiver/volumes/web/app-live/v1-web-app
```

`deploy` replaces only `workflow/debugger/` inside the document root, and
refuses to run against a directory that is not a `v1-web-app` (no `index.php`).
Nothing else in the platform is touched.

## Layout

```
src/
  api/          http (transport + platform envelopes) · bootstrap · session
                · workflow · lookups
  graph/        convert (session <-> React Flow, the axis swap) · autolayout
  components/
    canvas/     BlockNode · VizEdge
    settings/   registry (per-block schemas) · schema · serialize · fields
                · BlockSettingsDialog · ConnectionMappingEditor
    ui/         Modal · feedback (toasts, loaders, errors) · BlockIcon · icons
    Toolbar · Palette · DebugPanel · RunDialog · RecentLogs · WorkflowSettings
  lib/          runStatus (the platform's inconsistent status casing)
  Studio.tsx    canvas state, persistence, run/debug orchestration
  App.tsx       hash routing + bootstrap states
```
