/**
 * Workflow list — the `#/list` route, replacing the classic `workflow.html`
 * page.
 *
 * Arrangement follows the classic page: a "List by app" rail on the left, and a
 * single column of full-width rows on the right that reveal their actions and a
 * last-action card on hover. In the "All workflows" view the rows are broken up
 * by app heading, as the classic page does. Styling is the new UI's.
 *
 * `workflow.all` returns **every** workflow in one response with no paging, and
 * production tenants run to thousands. Rendering that as thousands of rows is
 * what breaks the browser, so the list is windowed: only the entries inside the
 * scrollport (plus an overscan margin) are ever in the DOM, while the full
 * array stays in memory for search, grouping and the app counts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { errorText } from '@/api/http';
import { fetchWorkflowList, type WorkflowListRow } from '@/api/workflowList';
import { debuggerHref } from '@/lib/routes';
import { InlineError, ListSkeleton } from './ui/feedback';
import { CopyIcon, ExternalIcon, PlusIcon, SearchIcon } from './ui/icons';

/**
 * Vertical stride per row. The card is shorter than the stride by exactly its
 * bottom gap — change one and the other must follow, or rows drift out of step
 * with the spacer that sizes the scrollbar.
 */
const ROW_GAP = 8;
const ROW_H = 56;
const CARD_H = ROW_H - ROW_GAP;
/** Group heading stride. */
const HEAD_H = 44;
/** Enough to decide whether the hover card fits below the row. */
const HOVER_CARD_H = 130;
/** Overscan margin, in rows, beyond each edge of the scrollport. */
const OVERSCAN = 6;

/** Rail entries that are not an app. App keys are ids or names, so no collision. */
const ALL = '[all]';
const RECENT = '[recent]';
const NO_APP = '[no-app]';

interface AppBucket {
  key: string;
  name: string;
  count: number;
}

/**
 * A flattened list entry. Headings and rows share one array with a running
 * pixel offset, so windowing stays a range scan even though the two have
 * different heights.
 */
type ListItem =
  | { kind: 'head'; key: string; title: string; count: number; top: number; height: number }
  | { kind: 'row'; key: string; row: WorkflowListRow; top: number; height: number };

function formatWhen(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())} ${d.toLocaleString(undefined, { month: 'short' })} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function WorkflowList() {
  const [rows, setRows] = useState<WorkflowListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<string>(ALL);

  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);

  /** Row the pointer is over, plus where to float its detail card. */
  const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchWorkflowList();
      setRows(res.rows);
    } catch (e) {
      setError(errorText(e, 'Could not load the workflow list.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    document.title = 'Workflows · Vizru';
  }, [load]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const measure = () => setViewportH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /** One rail entry per app the loaded workflows are tagged to. */
  const buckets = useMemo<AppBucket[]>(() => {
    const byKey = new Map<string, AppBucket>();
    rows.forEach((r) =>
      r.apps.forEach((a) => {
        const key = a.id || a.name;
        if (!key) return;
        const found = byKey.get(key);
        if (found) found.count += 1;
        else byKey.set(key, { key, name: a.name || a.id, count: 1 });
      }),
    );
    return [...byKey.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;

    if (bucket === RECENT) out = out.filter((r) => r.recent);
    else if (bucket !== ALL) out = out.filter((r) => r.apps.some((a) => (a.id || a.name) === bucket));

    if (q) {
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.shortCode.toLowerCase().includes(q) ||
          r.owner.toLowerCase().includes(q),
      );
    }
    return [...out].sort((a, b) => b.lastActionAt - a.lastActionAt);
  }, [rows, query, bucket]);

  const items = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    let top = 0;
    type Seed =
      | { kind: 'head'; key: string; title: string; count: number }
      | { kind: 'row'; key: string; row: WorkflowListRow };
    const push = (item: Seed, height: number) => {
      out.push({ ...item, top, height } as ListItem);
      top += height;
    };

    // Only "All workflows" groups. Recent, or a single app, is already one
    // homogeneous set and a heading over the whole list would just be noise.
    if (bucket !== ALL) {
      visible.forEach((r) => push({ kind: 'row', key: r.id, row: r }, ROW_H));
      return out;
    }

    const groups = new Map<string, WorkflowListRow[]>();
    visible.forEach((r) => {
      const keys = r.apps.length ? r.apps.map((a) => a.id || a.name) : [NO_APP];
      keys.forEach((k) => {
        const list = groups.get(k);
        if (list) list.push(r);
        else groups.set(k, [r]);
      });
    });

    const nameOf = (k: string) =>
      k === NO_APP ? 'Not connected to an app' : buckets.find((b) => b.key === k)?.name || k;

    [...groups.keys()]
      .sort((a, b) => {
        if (a === NO_APP) return 1;
        if (b === NO_APP) return -1;
        return nameOf(a).localeCompare(nameOf(b), undefined, { sensitivity: 'base' });
      })
      .forEach((k) => {
        const list = groups.get(k) as WorkflowListRow[];
        push({ kind: 'head', key: `h:${k}`, title: nameOf(k), count: list.length }, HEAD_H);
        // A workflow tagged to two apps appears under both, so the React key is
        // scoped by group to stay unique.
        list.forEach((r) => push({ kind: 'row', key: `${k}:${r.id}`, row: r }, ROW_H));
      });
    return out;
  }, [visible, bucket, buckets]);

  const contentH = items.length ? items[items.length - 1].top + items[items.length - 1].height : 0;

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setScrollTop(0);
    setHover(null);
  }, [query, bucket]);

  // Entries are variable-height, so the window is a pixel range rather than an
  // index slice.
  const pad = OVERSCAN * ROW_H;
  const from = scrollTop - pad;
  const to = scrollTop + viewportH + pad;
  const window_ = items.filter((it) => it.top + it.height >= from && it.top <= to);

  const heading =
    bucket === ALL
      ? 'All workflows'
      : bucket === RECENT
        ? 'My recent workflows'
        : buckets.find((b) => b.key === bucket)?.name || 'Workflows';

  const hovered = hover ? visible.find((r) => r.id === hover.id) : null;

  const copyShortCode = async (code: string) => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      /* clipboard blocked outside a secure context */
    }
  };

  const onRowEnter = (id: string, el: HTMLElement) => {
    const b = el.getBoundingClientRect();
    const below = b.bottom - 6;
    // Flip above when the card would run off the bottom of the viewport.
    const flip = below + HOVER_CARD_H > window.innerHeight;
    setHover({
      id,
      top: flip ? Math.max(12, b.top - HOVER_CARD_H + 6) : below,
      left: b.right - 400,
    });
  };

  if (loading) return <ListSkeleton />;

  return (
    <div className="viz-wl">
      <header className="viz-wl-top">
        <span className="viz-wl-brand">Workflows</span>
        <label className="viz-wl-search">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search workflow"
            aria-label="Search workflow"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button type="button" className="viz-btn" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      <div className="viz-wl-body">
        <aside className="viz-wl-rail">
          {/* A plain heading: the rail has nothing to collapse into. */}
          <h2 className="viz-wl-rail-head">List by app</h2>

          <nav className="viz-wl-rail-list">
              <button
                type="button"
                className={`viz-wl-rail-item${bucket === ALL ? ' is-active' : ''}`}
                onClick={() => setBucket(ALL)}
              >
                <span>All workflows</span>
                <span className="viz-wl-rail-count">{rows.length}</span>
              </button>
              <button
                type="button"
                className={`viz-wl-rail-item${bucket === RECENT ? ' is-active' : ''}`}
                onClick={() => setBucket(RECENT)}
              >
                <span>Recent Workflows</span>
                <span className="viz-wl-rail-count">{rows.filter((r) => r.recent).length}</span>
              </button>

              {buckets.map((b) => (
                <button
                  type="button"
                  key={b.key}
                  className={`viz-wl-rail-item${bucket === b.key ? ' is-active' : ''}`}
                  title={b.name}
                  onClick={() => setBucket(b.key)}
                >
                  <span>{b.name}</span>
                  <span className="viz-wl-rail-count">{b.count}</span>
                </button>
              ))}
          </nav>
        </aside>

        <main className="viz-wl-main">
          <div className="viz-wl-main-head">
            <h1>{heading}</h1>
            <span className="viz-wl-count">{visible.length.toLocaleString()}</span>
          </div>

          {error ? <InlineError>{error}</InlineError> : null}

          <div
            className="viz-wl-scroll"
            ref={scroller}
            onScroll={(e) => {
              setScrollTop((e.target as HTMLDivElement).scrollTop);
              setHover(null);
            }}
          >
            {visible.length === 0 ? (
              <p className="viz-wl-empty">
                {rows.length === 0
                  ? 'No workflows yet.'
                  : 'No workflows here. Try another app or clear the search.'}
              </p>
            ) : (
              <div className="viz-wl-spacer" style={{ height: contentH }}>
                {window_.map((it) =>
                  it.kind === 'head' ? (
                    <div className="viz-wl-group" key={it.key} style={{ top: it.top, height: it.height }}>
                      <span>{it.title}</span>
                      <span className="viz-wl-group-count">{it.count}</span>
                    </div>
                  ) : (
                    <div
                      className={`viz-wl-row${hover?.id === it.row.id ? ' is-hover' : ''}`}
                      key={it.key}
                      style={{ top: it.top, height: CARD_H }}
                      onMouseEnter={(e) => onRowEnter(it.row.id, e.currentTarget as HTMLElement)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <a className="viz-wl-row-link" href={debuggerHref(it.row.id)} title={it.row.title}>
                        <span className="viz-wl-row-name">
                          {it.row.title || <em className="viz-null">Untitled</em>}
                        </span>
                        {it.row.reusable ? <span className="viz-tagline">reusable</span> : null}
                      </a>

                      <div className="viz-wl-row-actions">
                        <button
                          type="button"
                          className="viz-icon-btn"
                          title={
                            copied === it.row.shortCode && it.row.shortCode ? 'Copied' : 'Copy short code'
                          }
                          disabled={!it.row.shortCode}
                          onClick={() => void copyShortCode(it.row.shortCode)}
                        >
                          <CopyIcon />
                        </button>
                        <a
                          className="viz-icon-btn"
                          href={debuggerHref(it.row.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in a new tab"
                        >
                          <ExternalIcon />
                        </a>
                      </div>

                      <span className="viz-wl-row-chev" aria-hidden="true" />
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <a className="viz-wl-fab" href="/workflow.new" title="Create a workflow">
        <PlusIcon size={20} />
      </a>

      {/*
        Portalled and fixed-positioned from the row's rect: the scroll container
        clips on both axes, so a card rendered inside a row would be cut off
        near the edges of the list.
      */}
      {hovered && hover
        ? createPortal(
            <div
              className="viz-wl-card"
              style={{ top: hover.top, left: Math.max(12, hover.left) }}
              role="presentation"
            >
              <div>
                <span>Last action by</span>
                <strong>{hovered.lastActionBy || '—'}</strong>
              </div>
              <div>
                <span>Last action date</span>
                <strong>{formatWhen(hovered.lastActionAt)}</strong>
              </div>
              <div>
                <span>Owner</span>
                <strong>{hovered.owner || '—'}</strong>
              </div>
              {hovered.shortCode ? (
                <div>
                  <span>Short code</span>
                  <strong className="is-mono">{hovered.shortCode}</strong>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
