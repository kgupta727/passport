import crypto from 'node:crypto';
import { db, Kind, Requirement, save } from './db.js';
import { FitRow, money, ordinal, WEEKDAYS } from './logic.js';

/**
 * The language model does exactly two jobs: turn a free-text need into requirement JSON,
 * and write a one-line Fit Check explanation. Scoring is plain code (logic.ts).
 * Without OPENAI_API_KEY a deterministic rule parser stands in.
 */

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
export const llmMode = KEY ? 'llm' : 'rules';

async function chatJSON(system: string, user: string): Promise<any | null> {
  if (!KEY) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    return JSON.parse(j.choices[0].message.content);
  } catch {
    return null;
  }
}

const req = (key: string, label: string, value: any, must = false): Requirement => ({ key, label, value, must, weight: must ? 3 : 1 });

const STOP = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'with', 'to', 'of', 'in', 'on', 'at', 'need', 'want', 'looking', 'some', 'my', 'me', 'i', 'any', 'good', 'cheap', 'under', 'less', 'than', 'max', 'please', 'tickets', 'ticket', 'tutor', 'tutoring', 'help', 'game']);

export function parseNeedRules(kind: Kind, text: string): Requirement[] {
  const t = text.toLowerCase();
  const out: Requirement[] = [];
  const isbn = text.replace(/-/g, '').match(/\b(97[89]\d{10}|\d{9}[\dx])\b/i);
  if (isbn) out.push(req('isbn', `ISBN ${isbn[1]}`, isbn[1], true));
  const ed = t.match(/(\d+)\s*(st|nd|rd|th)?\s*(ed\b|edition)/);
  if (ed) out.push(req('edition', `${ordinal(+ed[1])} edition`, +ed[1], true));
  if (/no (highlight|marking|notes|writing)|clean copy|unmarked/.test(t)) out.push(req('highlights', 'No highlights', 'none', /must|only|no highlight/.test(t)));
  const price = t.match(/(?:under|below|less than|max|up to|<)\s*\$?\s*(\d+)/) || t.match(/\$(\d+)\s*(?:max|or less|tops)/);
  if (price) out.push(req('maxPriceCents', `Under $${price[1]}`, +price[1] * 100));
  const course = text.match(/\b([A-Z]{2,4})\s?(\d{3,4})\b/);
  if (course && kind !== 'item') out.push(req('course', `${course[1]} ${course[2]}`, `${course[1]} ${course[2]}`, kind === 'service'));
  if (kind === 'ticket') {
    const q = t.match(/(\d+)\s*(tickets?|seats?)/) || t.match(/\b(two|pair)\b/);
    if (q) out.push(req('quantity', `${q[1] === 'two' || q[1] === 'pair' ? 2 : q[1]} tickets`, q[1] === 'two' || q[1] === 'pair' ? 2 : +q[1], true));
    const sec = t.match(/section\s*([a-z0-9-]+)/);
    if (sec) out.push(req('section', `Section ${sec[1].toUpperCase()}`, sec[1]));
    const vs = t.match(/(?:vs\.?|versus|against|the)\s+([a-z ]+?)\s+game/);
    if (vs) out.push(req('event', `${cap(vs[1])} game`, vs[1].trim(), true));
  }
  if (kind === 'service') {
    WEEKDAYS.forEach((d, i) => {
      if (t.includes(d.toLowerCase()) || t.includes(d.toLowerCase().slice(0, 3) + 's') || t.includes(d.toLowerCase().slice(0, 3) + ' ')) out.push(req('weekday', `Free ${d}s`, i));
    });
    if (/calc|calculus/.test(t) && !out.some((r) => r.key === 'course')) out.push(req('keywords', 'Calculus', ['calc'], true));
    if (/chem/.test(t) && !out.some((r) => r.key === 'course')) out.push(req('keywords', 'Chemistry', ['chem'], true));
  }
  if (kind === 'item' || (kind === 'ticket' && !out.some((r) => r.key === 'event'))) {
    const words = t.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
    // The head noun is the thing itself ("desk lamp" is a lamp); a match on a modifier alone would rank desks for a lamp.
    const head = kind === 'item' ? words.slice(-1) : words.slice(0, 4);
    if (words.length) out.push(req('keywords', head.slice(0, 3).map(cap).join(', '), head.map(singular), true));
  }
  if (/like new|mint|excellent/.test(t)) out.push(req('minCondition', 'Like new', 80));
  return out;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const singular = (w: string) => (w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

export async function parseNeed(kind: Kind, text: string): Promise<{ reqs: Requirement[]; by: 'llm' | 'rules' }> {
  const j = await chatJSON(
    'You convert a college student\'s marketplace request into JSON requirements. Return {"requirements":[{"key","label","value","must"}]}. ' +
      'Allowed keys: isbn (string), edition (number), highlights ("none"|"some"), course ("DEPT 123"), maxPriceCents (int), keywords (string[] of item nouns, singular), ' +
      'quantity (int), section (string), event (string, opponent or performer), date ("YYYY-MM-DD"), weekday (0=Sunday..6), minCondition (0-100). ' +
      'must=true only when the student clearly requires it. Labels are 1-4 plain words. Never judge condition or invent fields.',
    `kind=${kind}\nrequest=${text}`,
  );
  if (j && Array.isArray(j.requirements)) {
    const reqs = j.requirements
      .filter((r: any) => r && typeof r.key === 'string' && r.value != null)
      .map((r: any) => req(r.key, String(r.label ?? r.key).slice(0, 40), r.value, !!r.must));
    if (reqs.length) return { reqs, by: 'llm' };
  }
  return { reqs: parseNeedRules(kind, text), by: 'rules' };
}

/** One-line explanation, cached by listing id + need hash. */
export async function explainFit(listingId: string, needKey: string, title: string, F: number, rows: FitRow[]): Promise<string> {
  const hash = crypto.createHash('sha1').update(needKey + JSON.stringify(rows.map((r) => [r.key, r.status]))).digest('hex').slice(0, 12);
  const ck = `fit:${listingId}:${hash}`;
  if (db.cache[ck]) return db.cache[ck];
  let line: string | null = null;
  const j = await chatJSON(
    'Write one short, friendly sentence (max 18 words) explaining how well a listing fits a student\'s need, based ONLY on the provided rows. No emoji. Return {"line": "..."}',
    JSON.stringify({ title, fit: Math.round(F * 100), rows: rows.map((r) => ({ req: r.label, status: r.status, detail: r.detail })) }),
  );
  if (j?.line) line = String(j.line);
  if (!line) line = explainRules(rows);
  db.cache[ck] = line;
  save();
  return line;
}

export function explainRules(rows: FitRow[]): string {
  const met = rows.filter((r) => r.status === 'met');
  const miss = rows.filter((r) => r.status === 'miss');
  const unk = rows.filter((r) => r.status === 'unknown');
  if (!rows.length) return 'No specific requirements, so this is ranked on distance and seller reliability.';
  const lower = (s: string) => (/^[A-Z]{2,}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  if (!miss.length && !unk.length) return `Matches everything you asked for: ${met.map((r) => lower(r.label)).join(', ')}.`;
  const parts: string[] = [];
  if (met.length) parts.push(`Matches ${met.map((r) => lower(r.label)).join(', ')}`);
  if (miss.length) parts.push(`${miss.map((r) => lower(r.detail)).join('; ')}`);
  if (unk.length) parts.push(`we asked the seller about ${unk.map((r) => lower(r.label)).join(', ')}`);
  return parts.join('. ').replace(/^./, (c) => c.toUpperCase()) + '.';
}

export { money };
