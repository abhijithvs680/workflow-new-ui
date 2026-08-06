/// <reference types="vite/client" />
import { useCallback, useEffect, useState } from 'react';
import { loadWorkflow } from './api/bootstrap';
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
 */
function readRoute(): { param: string } {
  let path = window.location.pathname;
  const base = import.meta.env.BASE_URL;
  if (path.startsWith(base)) {
    path = path.slice(base.length);
  }
  path = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return { param: decodeURIComponent(path) };
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

  const load = useCallback(async (param: string) => {
    if (!param) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    clearLookupCache();
    try {
      const boot = await loadWorkflow(param);
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
    void load(route.param);
  }, [route.param, load]);

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
        onRetry={() => void load(route.param)}
      />
    );
  }

  return (
    // Remount on workflow change so the canvas never mixes two graphs.
    <Studio key={state.boot.workflowId} boot={state.boot} onReloadRequested={() => void load(route.param)} />
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
            const base = import.meta.env.BASE_URL;
            const newPath = `${base}${base.endsWith('/') ? '' : '/'}${encodeURIComponent(id)}`;
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
