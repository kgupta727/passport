import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './db.js';

function loadSecret(): string {
  if (process.env.SERVER_SECRET) return process.env.SERVER_SECRET;
  const f = path.join(DATA_DIR, 'secret.key');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8').trim();
}
const SECRET = loadSecret();

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');
const hmac = (s: string) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function sign(payload: object): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

export function verify<T = any>(token: string): T | null {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = hmac(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/* ---------- Handoff QR tokens ---------- */

export const SCAN_TTL_MS = 60_000;
export const SCAN_REISSUE_MS = 30_000;

export interface ScanPayload { k: 'scan'; trade_id: string; user_id: string; issued_at: number }

/** issued_at is bucketed to 30 s so the QR and the 6-digit code stay in lockstep. */
export function issueScanToken(tradeId: string, userId: string, nowMs: number) {
  const issued_at = Math.floor(nowMs / SCAN_REISSUE_MS) * SCAN_REISSUE_MS;
  const payload: ScanPayload = { k: 'scan', trade_id: tradeId, user_id: userId, issued_at };
  return { token: sign(payload), code: sixDigit(tradeId, userId, issued_at), issued_at, expires_at: issued_at + SCAN_TTL_MS, refresh_at: issued_at + SCAN_REISSUE_MS };
}

export function sixDigit(tradeId: string, userId: string, issuedAt: number): string {
  const h = crypto.createHmac('sha256', SECRET).update(`code|${tradeId}|${userId}|${issuedAt}`).digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Resolve a typed 6-digit code against the other party's live windows (current and previous, both under 60 s). */
export function matchCode(code: string, tradeId: string, otherUserId: string, nowMs: number): number | null {
  const bucket = Math.floor(nowMs / SCAN_REISSUE_MS) * SCAN_REISSUE_MS;
  for (const issued of [bucket, bucket - SCAN_REISSUE_MS]) {
    if (nowMs - issued <= SCAN_TTL_MS && sixDigit(tradeId, otherUserId, issued) === code) return issued;
  }
  return null;
}
