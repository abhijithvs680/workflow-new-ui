/// <reference types="vite/client" />
import { useCallback, useEffect, useState } from 'react';
import { loadWorkflow, loadWorkflowVersion } from './api/bootstrap';
import { clearLookupCache } from './api/lookups';
import { errorText, PlatformError } from './api/http';
import type { BootData } from './types/workflow';
import Studio from './Studio';
import { FullPageError, FullPageLoader } from './components/ui/feedback';

/**
 * History routing.
 *
 * Reads the workflow id or short code from the URL path.
 * e.g., `/workflow/debugger/<workflowId-or-shortCode>`.
 *
 * A saved version is addressed with `?version=<versionId>` on that same path
 * rather than a deeper `/version/<id>` segment: the build ships no `.htaccess`
 * (see `scripts/deploy.mjs`), so any extra path segment would fall through to
 * the PHP router and 404 on reload.
 */
function readRoute(): { param: string; versionId: string } {
  let path = window.location.pathname;
  const routeBase = '/workflow/debugger/';
  if (path.startsWith(routeBase)) {
    path = path.slice(routeBase.length);
  }
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const versionId = new URLSearchParams(window.location.search).get('version') || '';
  return { param: decodeURIComponent(path), versionId };
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; boot: BootData }
  | { status: 'error'; message: string; detail?: string };

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    const onLocationChange = () => setRoute(readRoute());
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  const load = useCallback(async (param: string, versionId: string) => {
    if (!param && !versionId) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    clearLookupCache();
    try {
      const boot = versionId ? await loadWorkflowVersion(versionId) : await loadWorkflow(param);
      setState({ status: 'ready', boot });
      document.title = boot.workflowName ? `${boot.workflowName} · Workflow Studio` : 'Workflow Studio';
    } catch (e) {
      setState({
        status: 'error',
        message: errorText(e, 'The workflow could not be loaded.'),
        detail: e instanceof PlatformError && e.status ? `HTTP ${e.status}` : undefined,
      });
    }
  }, []);

  useEffect(() => {
    void load(route.param, route.versionId);
  }, [route.param, route.versionId, load]);

  if (state.status === 'idle') {
    return <NoWorkflowSelected />;
  }

  if (state.status === 'loading') {
    return <FullPageLoader message="Loading workflow…" />;
  }

  if (state.status === 'error') {
    return (
      <FullPageError
        title="Could not open this workflow"
        message={state.message}
        detail={state.detail}
        onRetry={() => void load(route.param, route.versionId)}
      />
    );
  }

  return (
    // Remount on workflow change so the canvas never mixes two graphs.
    <Studio key={route.versionId || state.boot.workflowId} boot={state.boot} onReloadRequested={() => void load(route.param, route.versionId)} />
  );
}

function NoWorkflowSelected() {
  const [value, setValue] = useState('');

  return (
    <div className="viz-fullpage">
      <h1>Workflow Studio</h1>
      <p>Open a workflow by adding its id or short code to the address.</p>
      <form
        className="viz-open-form"
        onSubmit={(e) => {
          e.preventDefault();
          const id = value.trim();
          if (id) {
            const routeBase = '/workflow/debugger/';
            const newPath = `${routeBase}${routeBase.endsWith('/') ? '' : '/'}${encodeURIComponent(id)}`;
            window.history.pushState({}, '', newPath);
            window.dispatchEvent(new Event('popstate'));
          }
        }}
      >
        <input
          className="viz-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="workflow id, short code, or execution log id"
          aria-label="Workflow id or short code"
        />
        <button type="submit" className="viz-btn is-primary">
          Open
        </button>
      </form>
      <p className="viz-fullpage-detail">
        You must already be signed in to the platform in this browser — the app uses that session.
      </p>
    </div>
  );
}
