import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'passport.session';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set(token: string) { localStorage.setItem(TOKEN_KEY, token); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const r = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(session.token ? { authorization: `Bearer ${session.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && session.token) {
    session.clear();
    window.location.href = '/login';
  }
  if (!r.ok) throw new ApiError(r.status, j.error ?? 'Something went wrong');
  return j as T;
}

/** Tiny pub/sub so any mutation refreshes every live view (stands in for a realtime subscription). */
const listeners = new Set<() => void>();
export const refreshAll = () => listeners.forEach((l) => l());

export function useApi<T = any>(path: string | null, { poll }: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    try {
      const d = await api<T>(p);
      if (pathRef.current === p) { setData(d); setError(null); }
    } catch (e: any) {
      if (pathRef.current !== p) return;
      const transient = !(e instanceof ApiError) || e.status >= 500;
      if (transient) {
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(load, 2000);
      } else setError(e.message);
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(!!path);
    setData(null);
    load();
  }, [path, load]);

  useEffect(() => {
    listeners.add(load);
    return () => {
      listeners.delete(load);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [load]);

  useEffect(() => {
    if (!poll || !path) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, poll);
    return () => clearInterval(t);
  }, [poll, path, load]);

  return { data, error, loading, reload: load, setData };
}

export async function mutate<T = any>(path: string, body?: any, method = 'POST'): Promise<T> {
  const r = await api<T>(path, { method, body: body ?? {} });
  refreshAll();
  return r;
}

const TARGET_BYTES = 300 * 1024;

export async function uploadImage(file: File, max = 1600): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read that image'));
    el.src = URL.createObjectURL(file);
  });
  const bytes = (dataUrl: string) => Math.ceil((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  let side = max, url = '';
  for (let pass = 0; pass < 6; pass++) {
    const scale = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.72, 0.62]) {
      url = c.toDataURL('image/jpeg', q);
      if (bytes(url) <= TARGET_BYTES) break;
    }
    if (bytes(url) <= TARGET_BYTES) break;
    side = Math.round(side * 0.8);
  }
  URL.revokeObjectURL(img.src);
  const r = await api<{ url: string }>('/upload', { body: { data_url: url } });
  return r.url;
}
