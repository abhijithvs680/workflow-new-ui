/**
 * Transport for every platform call.
 *
 * Auth is the platform session cookie, so all requests are `same-origin` and
 * carry no CSRF token — exactly like the classic canvas. The platform decides
 * between an Ajax envelope and a full HTML page from `X-Requested-With`, so
 * that header is mandatory on JSON endpoints.
 */
import type { PlatformEnvelope, PlatformMessage } from '@/types/workflow';

const FORM_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
};

/** Thrown for anything the caller can surface directly to the user. */
export class PlatformError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'PlatformError';
    this.status = status;
  }
}

const SESSION_EXPIRED =
  'Your platform session has expired. Sign in to the platform in this browser, then reload.';

export type FormValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | FormValue[]
  | { [key: string]: FormValue };

/**
 * PHP-style nested encoding: `{a: [1, 2]}` -> `a[0]=1&a[1]=2`.
 * The platform reads arrays and hashes out of `$_POST` this way.
 */
export function encodeForm(params: Record<string, FormValue>): string {
  const body = new URLSearchParams();

  const append = (key: string, value: FormValue): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => append(`${key}[${index}]`, item));
      return;
    }
    if (typeof value === 'object') {
      Object.keys(value).forEach((child) => append(`${key}[${child}]`, value[child]));
      return;
    }
    body.append(key, String(value));
  };

  Object.keys(params).forEach((key) => append(key, params[key]));
  return body.toString();
}

function looksLikeHtmlPage(text: string): boolean {
  const head = text.trimStart().slice(0, 32).toLowerCase();
  return head.startsWith('<!doctype') || head.startsWith('<html');
}

/** A login redirect renders as a full HTML page where JSON was expected. */
function assertNotLoginPage(text: string): void {
  if (looksLikeHtmlPage(text)) throw new PlatformError(SESSION_EXPIRED, 401);
}

async function request(url: string, init: RequestInit): Promise<{ text: string; res: Response }> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...init });
  } catch (cause) {
    throw new PlatformError(
      `Could not reach the platform (${url}). Check your network connection.`,
      0,
    );
  }
  const text = await res.text();
  return { text, res };
}

/** GET returning raw text — used for the HTML pages we bootstrap from. */
export async function getText(url: string): Promise<string> {
  const { text, res } = await request(url, {
    method: 'GET',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new PlatformError(`${url} failed (${res.status})`, res.status);
  return text;
}

/**
 * POST a form and parse JSON when possible.
 * `savesession` answers `[]` or an empty body on success, which is not an error.
 */
export async function postForm<T = unknown>(
  url: string,
  params: Record<string, FormValue>,
): Promise<T | string> {
  const { text, res } = await request(url, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: encodeForm(params),
  });
  if (!res.ok) throw new PlatformError(`${url} failed (${res.status})`, res.status);
  assertNotLoginPage(text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

/** POST a form and require JSON back. */
export async function postJson<T = PlatformEnvelope>(
  url: string,
  params: Record<string, FormValue>,
): Promise<T> {
  const { text, res } = await request(url, {
    method: 'POST',
    headers: FORM_HEADERS,
    body: encodeForm(params),
  });
  assertNotLoginPage(text);

  let data: T | null = null;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new PlatformError(
      res.ok
        ? `Unreadable response from ${url}.`
        : `${url} failed (${res.status}).`,
      res.status,
    );
  }
  if (!res.ok && !data) throw new PlatformError(`${url} failed (${res.status})`, res.status);
  return data;
}

/** GET returning JSON. */
export async function getJson<T = unknown>(url: string): Promise<T> {
  const { text, res } = await request(url, {
    method: 'GET',
    headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
  });
  if (!res.ok) throw new PlatformError(`${url} failed (${res.status})`, res.status);
  assertNotLoginPage(text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PlatformError(`Unreadable response from ${url}.`, res.status);
  }
}

/* -------------------------------------------------------------------------- */
/* Envelope helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Flash messages arrive as either `[{type, text}, …]` or
 * `{success: ['…'], error: ['…']}`. Normalize so callers can always `.find`.
 */
export function platformMessages(res: unknown): PlatformMessage[] {
  const raw = (res as PlatformEnvelope | null)?.Actions?.messages;
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw.map((m) =>
      typeof m === 'string'
        ? { type: 'success', text: m }
        : {
            type: (m as any)?.type || 'info',
            text: (m as any)?.text || (m as any)?.message || String(m),
          },
    );
  }

  if (typeof raw === 'object') {
    const out: PlatformMessage[] = [];
    Object.entries(raw as Record<string, unknown>).forEach(([type, value]) => {
      const list = Array.isArray(value) ? value : [value];
      list.forEach((text) => {
        if (text == null || text === '') return;
        out.push({ type, text: String(text) });
      });
    });
    return out;
  }

  return [];
}

/** The platform reports save failures through messages, not HTTP status. */
export function platformSaveOk(res: unknown): boolean {
  if (!res) return false;
  const result = (res as PlatformEnvelope).Result;
  if (result === false || result === 0) return false;
  return !platformMessages(res).some((m) => m.type === 'error' || m.type === 'danger');
}

/** Unwrap `{Body: "<json string>"}` envelopes into a plain object. */
export function envelopeBody<T = Record<string, unknown>>(res: unknown): T {
  if (!res) return {} as T;
  if (Array.isArray(res)) return { records: res, result: res } as unknown as T;

  const envelope = res as PlatformEnvelope;
  let body: unknown = envelope.Body !== undefined ? envelope.Body : res;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  return (body && typeof body === 'object' ? body : res) as T;
}

/** Turn any thrown value into a message safe to show in a toast. */
export function errorText(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}
