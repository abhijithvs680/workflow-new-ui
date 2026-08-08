/// <reference types="vite/client" />
import { useCallback, useEffect, useState } from 'react';
import { loadWorkflow, loadWorkflowVersion } from './api/bootstrap';
import { clearLookupCache } from './api/lookups';
import { errorText, PlatformError } from './api/http';
import type { BootData } from './types/workflow';
import Studio from './Studio';
import { CanvasSkeleton, FullPageError } from './components/ui/feedback';

import { debuggerHref, go, readRoute, type Route } from './lib/routes';
import WorkflowList from './components/WorkflowList';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; boot: BootData }
  | { status: 'error'; message: string; detail?: string };

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    const onLocationChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onLocationChange);
    window.addEventListener('popstate', onLocationChange);
    return () => {
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
    };
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

  const param = route.name === 'debugger' ? route.param : '';
  const versionId = route.name === 'debugger' ? route.versionId : '';

  useEffect(() => {
    if (route.name !== 'debugger') return;
    void load(param, versionId);
  }, [route.name, param, versionId, load]);

  // `#/list` is the landing route, and replaces the classic workflow.html page.
  if (route.name === 'list') {
    return <WorkflowList />;
  }

  if (state.status === 'idle') {
    return <NoWorkflowSelected />;
  }

  if (state.status === 'loading') {
    return <CanvasSkeleton />;
  }

  if (state.status === 'error') {
    return (
      <FullPageError
        title="Could not open this workflow"
        message={state.message}
        detail={state.detail}
        onRetry={() => void load(param, versionId)}
      />
    );
  }

  return (
    // Remount on workflow change so the canvas never mixes two graphs.
    <Studio
      key={versionId || state.boot.workflowId}
      boot={state.boot}
      onReloadRequested={() => void load(param, versionId)}
    />
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
          if (id) go(debuggerHref(id));
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
