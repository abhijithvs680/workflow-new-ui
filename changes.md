# Workflow Debugger Updates

This document summarizes the changes made to fix the connections issue and update the UI styling for the condition block and settings panel.

## 1. Fixed Missing Connections

**Issue:** Connections between existing workflow blocks were not showing.
**Root Cause:** The `getText()` function in `src/api/http.ts` was sending the `X-Requested-With: XMLHttpRequest` header. This caused the platform to return the HTML wrapped in a JSON envelope (`{ Body: "<html>…" }`). While the envelope was being unwrapped, the jsPlumb `connect()` calls containing UUID strings were getting corrupted or escaped differently during the JSON encoding/decoding process, causing the regex matcher to fail finding the connections.
**Solution:**
- Added a new `getHtml()` function in `src/api/http.ts` that fetches pages without the `X-Requested-With` header, prompting the platform to return raw HTML directly.
- Updated the connection regex in `src/api/bootstrap.ts` to match both single- and double-quoted UUID strings as a fallback safety measure.
- Switched all three bootstrap endpoint calls (`/workflow.debugger/{id}`, `/isChild/`, and `/workflow.settings/{shortCode}/json`) to use `getHtml()`.

## 2. Condition Block & Edge Styling

Updated the condition block node to match the new reference design:
- **Diamond Shape:** Replaced the bordered outline with a solid orange gradient (`linear-gradient(135deg, #fb923c, #ea580c)`) and removed the border. Added a subtle orange box-shadow.
- **Size:** Increased the condition block body from 100px to 110px.
- **Icon:** Applied a CSS filter (`brightness(0) invert(1)`) to make the condition block icon white against the orange background.
- **Labels:** Styled the Yes/No branch labels into solid rounded pills (Green for Yes, Red for No) with white text, positioned at the respective output edges.
- **Handles:** Colored the output handle connection points to match their respective branch colors (Green dot for Yes, Red dot for No).
- **Edges:** Updated the styling of the Edge components to render the Yes/No labels as solid colored pills, matching the new styling of the handles and labels.

## 3. Settings Panel Redesign

Transformed the Workflow Settings from a centered modal dialog into a right-side sliding panel:
- **Layout:** Replaced the `Modal` wrapper in `WorkflowSettings.tsx` with a custom `div` overlay containing a fixed 300px wide right panel with a slide-in animation.
- **Structure:** Removed the tabbed layout (Runtime/Versions) and consolidated all settings into a single scrollable panel.
- **New Sections:** Added placeholder sections for "Add to category", "Connect to an App", and "Reusable" with basic UI elements (inputs, dropdowns, buttons) matching the reference design.
- **Versions List:** Redesigned the versions list to show formatted rows with the version ID/Note and inline actions (Restore, Delete), with a "Create" button in the section header. The create action still triggers a centered modal for text input.

## 4. Removed Hash Routing (`#`)

**Issue:** The app used hash-based routing (e.g. `/#/123`), making the URLs less standard.
**Solution:** Switched from hash routing to standard browser history routing (e.g. `/workflow/debugger/123`).
- **`src/App.tsx`**: Updated the `readRoute` function to parse `window.location.pathname` instead of `window.location.hash`.
- Added `/// <reference types="vite/client" />` to resolve TypeScript errors associated with using `import.meta.env.BASE_URL` to strip the `/workflow/debugger/` prefix cleanly.

## 5. Asset Base Path Modification

**Issue:** The build was generating assets pointing to `/workflow/debugger/assets`, but the requirement was to point them to `/workflow/debugger/dist/assets`.
**Solution:**
- Updated the `base` property in `vite.config.ts` from `APP_BASE` (which is `/workflow/debugger/`) to explicitly `/workflow/debugger/dist/`.
- Decoupled `App.tsx` routing from Vite's `base` configuration by hardcoding `routeBase = '/workflow/debugger/'` rather than relying on `import.meta.env.BASE_URL`. This ensures routing still evaluates paths starting from the intended host path while JS and CSS static assets resolve to `dist/`.
- Updated `vite.config.ts` to make the `base` conditional (`mode === 'development' ? APP_BASE : '/workflow/debugger/dist/'`) so the Vite dev server works correctly without throwing a base URL error.

## 6. Node Actions Hover Toolbar Styling

**Issue:** The user requested styling the node actions toolbar (the Edit, Add, Clone, Delete buttons that appear on hover) to match a new reference design.
**Solution:**
- Updated `.viz-node-actions` in `src/styles/index.css` to have a white background, rounded pill-like shape (`border-radius: 10px`), and a drop shadow. Also added a nice slide-up floating animation on hover.
- Re-styled the action buttons within the toolbar to use a light gray background (`#f8fafc`), rounded corners (`8px`), and a slightly darker hover state (`#f1f5f9`).
- Set a distinct light red background (`#fef2f2`) and red text (`#ef4444`) for the Delete button (class `.is-danger`), to clearly differentiate destructive actions.
- Resized the toolbar components (smaller button paddings, tighter gaps, and slightly smaller font size) so the entire toolbar fits cleanly within the standard `220px` width of a workflow block without bleeding outside the edges.
- Increased the vertical padding inside `.viz-node-body` to slightly increase the overall height of the block nodes as requested.

## 7. Removed Selection Actions from Top Bar

**Issue:** The "Edit", "Clone", and "Delete" buttons were showing up in the top header toolbar when a node was selected. The user requested these to be removed since these actions are now handled by the hover toolbar.
**Solution:** Removed the conditional `viz-toolbar-selection` block rendering these buttons from `src/components/Toolbar.tsx` and cleaned up unused imports and variables.

## 8. Styled Palette Search Box

**Issue:** The "Search blocks..." input in the blocks palette was completely unstyled, relying on browser defaults.
**Solution:** Applied the standard `.viz-input` class to the search box in `src/components/Palette.tsx` to give it consistent styling with other inputs in the application (rounded corners, standard borders, and consistent focus states).

## 9. Palette Grid Layout and Hover Effect

**Issue:** The blocks palette was originally a simple vertical list. The user requested arranging the items in a grid layout where each block is a rounded square containing an icon, and hovering over the block expands it to show the block name on a colored background.
**Solution:**
- Updated `.viz-palette-group ul` in `src/styles/index.css` to use `display: grid` with 5 fluid columns (`repeat(5, 1fr)`) and a 6px gap to reduce the size of the blocks.
- Styled the block items (`.viz-palette-group li button`) as square cards (`aspect-ratio: 1`) with a slate gray background (`#64748b`) and a white icon in the center.
- Implemented a hover effect overlay (`position: absolute`) that expands the block downwards, changes the background to the standard UI magenta (`#9d0052`), and reveals the block label underneath the icon.
- Added conditional rendering in `src/components/Palette.tsx` to apply `.is-list-view` to "Workflows", "Endpoints", and "Reusable Workflows" categories so they retain their original vertical list styling as requested by the user, while other categories use `.is-grid-view`.
