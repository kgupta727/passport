/* Add a campus with no code: one config JSON plus one course CSV.
   The same installer runs at seed time (files in server/tenants) and live from the admin screen. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB, Tenant, TenantConfig, User } from './db.js';

export const TENANT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tenants');
const METERS_PER_MINUTE = 64;

export interface CourseRow { code: string; title: string; isbn?: string; book_title?: string; author?: string; edition?: number | null; required: boolean }

export const COURSE_CSV_HEADER = 'code,title,isbn,book_title,author,edition,required';

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseCoursesCsv(text: string): { rows: CourseRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = String(text ?? '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return { rows: [], errors: ['The course CSV is empty'] };
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (head[0] !== 'code' || head[1] !== 'title') return { rows: [], errors: [`The first CSV line must be the header: ${COURSE_CSV_HEADER}`] };
  const col = (r: string[], k: string) => { const i = head.indexOf(k); return i >= 0 ? r[i] ?? '' : ''; };
  const rows: CourseRow[] = [];
  lines.slice(1).forEach((line, i) => {
    const r = splitCsvLine(line);
    const code = col(r, 'code'), title = col(r, 'title');
    const isbn = col(r, 'isbn').replace(/[^0-9X]/gi, '');
    if (!code || !title) return errors.push(`CSV line ${i + 2}: code and title are required`);
    if (isbn && isbn.length !== 10 && isbn.length !== 13) return errors.push(`CSV line ${i + 2}: ISBN ${isbn} should be 10 or 13 digits`);
    const ed = col(r, 'edition');
    rows.push({
      code, title, isbn: isbn || undefined, book_title: col(r, 'book_title') || undefined, author: col(r, 'author') || undefined,
      edition: ed ? Number(ed) || null : null, required: !/^(no|false|0|optional)$/i.test(col(r, 'required')),
    });
  });
  if (!rows.length && !errors.length) errors.push('The course CSV has a header but no courses');
  return { rows, errors };
}

const num = (x: any) => typeof x === 'number' && Number.isFinite(x);
const meters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000, r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Checks a campus file and fills safe defaults. Returns the tenant it would create, or the problems. */
export function validateCampus(raw: any, db: DB): { tenant: Tenant | null; errors: string[]; filled: string[] } {
  const errors: string[] = [], filled: string[] = [];
  const j = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch (e: any) { errors.push(`Config is not valid JSON: ${e.message}`); return null; } })() : raw;
  if (!j || typeof j !== 'object') return { tenant: null, errors: errors.length ? errors : ['Config must be a JSON object'], filled };
  const c = j.config ?? {};

  if (!/^[a-z0-9-]{2,24}$/.test(j.slug ?? '')) errors.push('slug: 2 to 24 lowercase letters, digits or dashes');
  else if (db.tenants.some((t) => t.slug === j.slug)) errors.push(`slug: "${j.slug}" is already a campus`);
  if (!j.name) errors.push('name: the full school name is required');
  if (!j.short || String(j.short).length > 12) errors.push('short: a short label like "UAB", 12 characters at most');
  else if (db.tenants.some((t) => t.short.toLowerCase() === String(j.short).toLowerCase())) errors.push(`short: "${j.short}" is taken`);
  if (!Array.isArray(j.domains) || !j.domains.length) errors.push('domains: at least one .edu email domain');
  else for (const d of j.domains) {
    if (!/^[a-z0-9.-]+\.edu$/.test(d)) errors.push(`domains: "${d}" must be a .edu domain`);
    else if (db.tenant_domains.some((x) => x.domain === d)) errors.push(`domains: "${d}" already belongs to a campus`);
  }
  if (!c.city) errors.push('config.city is required');

  const zones = Array.isArray(c.safeZones) ? c.safeZones : [];
  if (!zones.length) errors.push('config.safeZones: at least one public, staffed, well-lit meeting spot');
  zones.forEach((z: any, i: number) => {
    if (!z?.id || !z?.name || !num(z?.lat) || !num(z?.lng)) errors.push(`config.safeZones[${i}]: needs id, name, lat and lng`);
  });
  const housing = Array.isArray(c.housing) ? c.housing : [];
  if (!housing.length) errors.push('config.housing: at least one residence hall or area');
  housing.forEach((h: any, i: number) => { if (!h?.id || !h?.name) errors.push(`config.housing[${i}]: needs id and name`); });

  const walk: Record<string, Record<string, number>> = { ...(c.walk ?? {}) };
  let computed = 0;
  for (const h of housing) {
    walk[h.id] = { ...(walk[h.id] ?? {}) };
    for (const z of zones) {
      if (num(walk[h.id][z.id])) continue;
      if (num(h.lat) && num(h.lng) && num(z.lat) && num(z.lng)) { walk[h.id][z.id] = Math.max(1, Math.round(meters(h, z) / METERS_PER_MINUTE)); computed++; }
      else errors.push(`config.walk: minutes from ${h.id} to ${z.id} are missing (or give the housing lat and lng)`);
    }
  }
  if (computed) filled.push(`walk: ${computed} times computed from coordinates`);

  let map = c.map;
  const okZones = zones.filter((z: any) => num(z?.lat) && num(z?.lng));
  if (!map && okZones.length) {
    const lats = okZones.map((z: any) => z.lat), lngs = okZones.map((z: any) => z.lng);
    const pad = 0.004;
    map = {
      center: [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2],
      zoom: 16, bounds: [[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad]],
    };
    filled.push('map: center and bounds fitted to the safe zones');
  } else if (map && (!Array.isArray(map.center) || !num(map.zoom) || !Array.isArray(map.bounds))) errors.push('config.map: needs center [lat, lng], zoom and bounds [[s, w], [n, e]]');

  const features = { arena: true, tickets: true, services: true, crossCampus: true, chat: true, explore: true, ...(c.features ?? {}) };
  if (!c.features) filled.push('features: all on');
  if (!c.library) filled.push('library: none listed');
  if (errors.length) return { tenant: null, errors, filled };

  const config: TenantConfig = {
    displayName: c.displayName ?? j.short,
    city: c.city,
    safeZones: zones.map((z: any) => ({ id: z.id, name: z.name, lat: z.lat, lng: z.lng })),
    housing: housing.map((h: any) => ({ id: h.id, name: h.name })),
    walk,
    library: c.library ?? { name: `${j.short} library`, url: '' },
    courseCatalog: c.courseCatalog ?? `csv:${j.slug}`,
    shuttleDays: Array.isArray(c.shuttleDays) ? c.shuttleDays : [],
    ticketPriceCap: num(c.ticketPriceCap) ? c.ticketPriceCap : 1.15,
    geofenceRequired: !!c.geofenceRequired,
    features,
    map,
    ...(c.rarityModels ? { rarityModels: c.rarityModels } : {}),
    ...(c.examples ? { examples: c.examples } : {}),
  };
  return { tenant: { id: `ten_${j.slug}`, slug: j.slug, name: j.name, short: j.short, domains: j.domains, config }, errors, filled };
}

/** Courses, required books and a demo admin for one tenant. Books are matched by ISBN, created when new. */
export function installCourses(db: DB, t: Tenant, rows: CourseRow[]) {
  for (const r of rows) {
    const cid = `crs_${t.slug}_${r.code.replace(/\s/g, '').toLowerCase()}`;
    if (db.courses.some((c) => c.id === cid)) continue;
    db.courses.push({ id: cid, tenant_id: t.id, code: r.code, title: r.title });
    if (!r.isbn) continue;
    let book = db.books.find((b) => b.isbn === r.isbn);
    if (!book) {
      book = { id: `bk_isbn${r.isbn}`, isbn: r.isbn, title: r.book_title ?? `ISBN ${r.isbn}`, edition: r.edition ?? null, author: r.author ?? '', prices: {} };
      db.books.push(book);
    }
    db.course_books.push({ course_id: cid, book_id: book.id, required: r.required });
  }
}

export function demoAdminFor(t: Tenant, at: number): User {
  return { id: `usr_${t.slug}_admin`, tenant_id: t.id, email: `admin@${t.domains[0]}`, handle: `${t.slug}_admin`, name: `${t.short} Student Affairs`, housing: t.config.housing[0].id, trust_credit: 0, is_admin: true, demo: true, created_at: at };
}

export function readCoursesCsv(slug: string): CourseRow[] | null {
  const f = path.join(TENANT_DIR, `${slug}.courses.csv`);
  if (!fs.existsSync(f)) return null;
  return parseCoursesCsv(fs.readFileSync(f, 'utf8')).rows;
}

export function writeCampusFiles(t: Tenant, csv: string) {
  const file = { slug: t.slug, name: t.name, short: t.short, domains: t.domains, config: t.config };
  fs.writeFileSync(path.join(TENANT_DIR, `${t.slug}.json`), JSON.stringify(file, null, 2) + '\n');
  fs.writeFileSync(path.join(TENANT_DIR, `${t.slug}.courses.csv`), csv.trim() + '\n');
}
