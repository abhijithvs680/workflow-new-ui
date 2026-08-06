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
