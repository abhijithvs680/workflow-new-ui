import { useCallback, useEffect, useState } from 'react';
import { loadWorkflow } from './api/bootstrap';
import { clearLookupCache } from './api/lookups';
import { errorText, PlatformError } from './api/http';
import type { BootData } from './types/workflow';
import Studio from './Studio';
import { FullPageError, FullPageLoader } from './components/ui/feedback';

/**
 * Hash routing.
 *
 * The app is a static bundle inside the platform document root, so it cannot
 * use history routing — every path under `/workflow/debugger/` other than the
 * index would fall through Apache's rewrite into `index.php`. The workflow is
 * therefore addressed as `#/<workflowId-or-shortCode>`, optionally
 * `#/<id>/log/<logId>`.
 */
function readRoute(): { param: string } {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  return { param: decodeURIComponent(raw.split('?')[0].replace(/\/+$/, '')) };
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
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
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
          if (id) window.location.hash = `#/${encodeURIComponent(id)}`;
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
