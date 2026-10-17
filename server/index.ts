import express, { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  db, loadDB, replaceDB, save, now, id, scoped, visibleListings, visibleListingsFor, tripTenantIds, userById, tenantById, Kind, Listing, User, UPLOAD_DIR, MIN, DAY,
} from './db.js';
import { seed, baselineSales } from './seed.js';
import { marketView } from './market.js';
import { validateCampus, parseCoursesCsv, installCourses, demoAdminFor, writeCampusFiles, COURSE_CSV_HEADER } from './campus.js';
import { runIsolationChecks } from './isolation.js';
import { sign, verify, issueScanToken, matchCode, ScanPayload, SCAN_TTL_MS } from './tokens.js';
import {
  HttpError, advanceTrade, claimListing, describeTrade, slotOptions, runTimers, scanWindow, recordScan, systemEvent, sideOf, applyNearMiss,
  alertMatches, REASONS, lockDuelPrices, listingOf, slotOf, isActive, describeSlot, notify, paymentsMode, payModeFor,
} from './trade.js';
import { startDuel, openDuel, playMove, duelView, autoplayOther, setStakes, acceptStakes } from './arena.js';
import {
  suggestPrice, CONDITION_STEPS, ConditionStep, stampCount, publicUser, trustLevel, trustCredit, refreshTrust, money, freshness, tradeParty, LEVELS,
} from './logic.js';
import { parseNeed, llmMode } from './llm.js';
import { escrowMode } from './escrow.js';
import { exploreView } from './explore.js';
import './rarity.js';
import { rankOffers, passportView, kitView, homeView, tradeSummary, answerQuestion, bookOptions, listingCard, photosOf, SOURCE_LABELS } from './views.js';

loadDB(seed);
db.users.forEach((u) => refreshTrust(u.id));
save();

const app = express();
app.use(express.json({ limit: '6mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '1h' }));

const DEMO = process.env.DEMO_MODE !== 'false';

interface Ctx { user: User; tenantId: string }
declare global {
  namespace Express { interface Request { ctx: Ctx } }
}

const wrap = (fn: (req: Request, res: Response) => any) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) {
    next(e);
  }
};

function auth(req: Request, _res: Response, next: NextFunction) {
  const h = req.header('authorization') ?? '';
  const claims = verify<{ uid: string; tid: string }>(h.replace(/^Bearer\s+/i, ''));
  const user = claims ? userById(claims.uid) : undefined;
  if (!claims || !user || user.tenant_id !== claims.tid) return next(new HttpError(401, 'Please sign in again'));
  req.ctx = { user, tenantId: claims.tid };
  next();
}

const session = (u: User) => ({ token: sign({ uid: u.id, tid: u.tenant_id, iat: now() }), user: meView(u) });

function meView(u: User) {
  const t = tenantById(u.tenant_id);
  const tc = trustCredit(u.id);
  return {
    ...publicUser(u), email: u.email, is_admin: !!u.is_admin,
    trust: { ...trustLevel(u.trust_credit), handoffs: tc.handoffs, no_shows: tc.noShows, late_cancels: tc.lateCancels },
    tenant: {
      id: t.id, slug: t.slug, name: t.name, short: t.short,
      config: { brand: t.config.brand ?? null, payments: paymentsMode(t.id), safeZones: t.config.safeZones, housing: t.config.housing, ticketPriceCap: t.config.ticketPriceCap, features: t.config.features, library: t.config.library, geofenceRequired: t.config.geofenceRequired, examples: t.config.examples ?? {} },
      others: t.config.features.crossCampus ? db.tenants.filter((x) => x.id !== t.id && x.config.features.crossCampus).map((x) => x.short) : [],
    },
    platform_admin: !!u.is_admin && (DEMO || PLATFORM_ADMINS.has(u.email)),
  };
}

/* ---------- Public ---------- */

app.get('/api/tenants', wrap(() => db.tenants.map((t) => ({
  id: t.id, slug: t.slug, name: t.name, short: t.short, domains: t.domains,
  demo: DEMO ? db.users.filter((u) => u.tenant_id === t.id && u.demo).map((u) => ({ email: u.email, handle: u.handle, name: u.name, is_admin: !!u.is_admin })) : [],
}))));

app.get('/api/status', wrap((req) => ({ demo: DEMO, escrow: escrowMode, payments: paymentsMode(verify<{ uid: string; tid: string }>(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''))?.tid), llm: llmMode, clock_offset_ms: db.meta.clock_offset_ms, server_now: now() })));

/* ---------- Auth: .edu email picks the tenant, magic link ---------- */

function tenantForEmail(email: string) {
  const m = String(email).trim().toLowerCase().match(/^[^\s@]+@([^\s@]+\.[^\s@]+)$/);
  if (!m) throw new HttpError(400, 'Enter your full email address');
  const domain = m[1];
  if (!domain.endsWith('.edu')) throw new HttpError(400, 'Passport is for students. Use your .edu email.');
  const row = db.tenant_domains.find((d) => domain === d.domain || domain.endsWith('.' + d.domain));
  if (!row) throw new HttpError(404, `${domain} is not on Passport yet. Ask your school to add it: one row and a config file.`);
  return { domain, tenant_id: row.tenant_id };
}

app.post('/api/auth/start', wrap((req) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const { tenant_id } = tenantForEmail(email);
  const token = crypto.randomBytes(18).toString('base64url');
  db.magic_links.push({ token, email, tenant_id, expires_at: now() + 15 * MIN, used: false });
  save();
  return { sent: true, campus: tenantById(tenant_id).short, dev_link: `/auth/verify?token=${token}` };
}));

app.post('/api/auth/verify', wrap((req) => {
  const ml = db.magic_links.find((m) => m.token === req.body.token);
  if (!ml || ml.used || ml.expires_at < now()) throw new HttpError(400, 'That link expired. Request a new one.');
  ml.used = true;
  let u = db.users.find((x) => x.email === ml.email);
  let isNew = false;
  if (!u) {
    isNew = true;
    let base = ml.email.split('@')[0].replace(/[^a-z0-9_]/g, '_').slice(0, 16) || 'student';
    let handle = base, n = 1;
    while (db.users.some((x) => x.handle === handle)) handle = `${base}${++n}`;
    u = { id: id('usr'), tenant_id: ml.tenant_id, email: ml.email, handle, name: handle, housing: tenantById(ml.tenant_id).config.housing[0].id, trust_credit: 0, created_at: now() };
    db.users.push(u);
  }
  save();
  return { ...session(u), is_new: isNew };
}));

app.post('/api/auth/demo', wrap((req) => {
  if (!DEMO) throw new HttpError(403, 'Demo accounts are off');
  const u = db.users.find((x) => x.email === String(req.body.email).toLowerCase() && x.demo);
  if (!u) throw new HttpError(404, 'Not a demo account');
  return session(u);
}));

const PUBLIC = new Set(['/tenants', '/status', '/demo/reset', '/demo/clock']);
app.use('/api', (req, res, next) => (req.path.startsWith('/auth') || PUBLIC.has(req.path) ? next() : auth(req, res, next)));

app.get('/api/me', wrap((req) => meView(req.ctx.user)));
app.patch('/api/me', wrap((req) => {
  const u = req.ctx.user;
  const t = tenantById(u.tenant_id);
  if (req.body.housing) {
    if (!t.config.housing.some((h) => h.id === req.body.housing)) throw new HttpError(400, 'Unknown housing area');
    u.housing = req.body.housing;
  }
  if (req.body.name) u.name = String(req.body.name).slice(0, 40);
  save();
  return meView(u);
}));

/* ---------- Home and notifications ---------- */

app.get('/api/home', wrap((req) => homeView(req.ctx.user)));
app.post('/api/notifications/read', wrap((req) => {
  db.notifications.filter((n) => n.user_id === req.ctx.user.id).forEach((n) => (n.read = true));
  save();
  return { ok: true };
}));

/* ---------- Needs ---------- */

const KINDS: Kind[] = ['item', 'textbook', 'ticket', 'service'];

app.post('/api/needs', wrap(async (req) => {
  const u = req.ctx.user;
  const kind = req.body.kind as Kind;
  const text = String(req.body.text ?? '').trim().slice(0, 200);
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Pick a category');
  if (text.length < 3) throw new HttpError(400, 'Say what you are looking for');
  const parsed = await parseNeed(kind, text);
  const n = { id: id('ned'), tenant_id: u.tenant_id, user_id: u.id, kind, free_text: text, requirements: parsed.reqs, status: 'watching' as const, prefs: {}, parsed_by: parsed.by, created_at: now() };
  db.needs.push(n);
  save();
  return n;
}));

function myNeed(req: Request) {
  const n = scoped(db.needs, req.ctx.tenantId).find((x) => x.id === req.params.id && x.user_id === req.ctx.user.id);
  if (!n) throw new HttpError(404, 'Need not found');
  return n;
}

app.get('/api/needs/:id', wrap(async (req) => {
  const n = myNeed(req);
  const offers = n.status === 'watching' || n.status === 'sorted' ? await rankOffers(n, req.ctx.user) : [];
  const trade = db.trades.find((t) => t.need_id === n.id && isActive(t));
  const course = n.course_id ? db.courses.find((c) => c.id === n.course_id) : null;
  const alternatives = n.book_id ? bookOptions(n.book_id, req.ctx.user).filter((o) => o.source !== 'campus') : [];
  return { need: n, offers, trade_id: trade?.id ?? null, course, alternatives };
}));

app.patch('/api/needs/:id', wrap((req) => {
  const n = myNeed(req);
  if (Array.isArray(req.body.requirements)) {
    n.requirements = req.body.requirements
      .filter((r: any) => n.requirements.some((x) => x.key === r.key) || r.key === 'maxPriceCents' || r.key === 'maxMinutes')
      .map((r: any) => ({ key: r.key, label: String(r.label), value: r.value, must: !!r.must, weight: r.must ? 3 : 1 }));
  }
  if (req.body.status === 'closed' || req.body.status === 'watching') n.status = req.body.status;
  save();
  return n;
}));

app.delete('/api/needs/:id', wrap((req) => {
  const n = myNeed(req);
  n.status = 'closed';
  save();
  return { ok: true };
}));

/* ---------- Course Kit ---------- */

app.get('/api/courses', wrap((req) => {
  const q = String(req.query.q ?? '').toLowerCase().replace(/\s/g, '');
  return scoped(db.courses, req.ctx.tenantId)
    .filter((c) => !q || c.code.toLowerCase().replace(/\s/g, '').includes(q) || c.title.toLowerCase().includes(String(req.query.q).toLowerCase()))
    .slice(0, 20)
    .map((c) => ({ ...c, added: db.user_courses.some((uc) => uc.user_id === req.ctx.user.id && uc.course_id === c.id), books: db.course_books.filter((cb) => cb.course_id === c.id).length }));
}));

app.get('/api/kit', wrap((req) => kitView(req.ctx.user)));

app.get('/api/books', wrap((req) => {
  const isbn = String(req.query.isbn ?? '').replace(/[^0-9xX]/g, '');
  const b = db.books.find((x) => x.isbn === isbn);
  if (!b) return { book: null };
  const courses = db.course_books.filter((cb) => cb.book_id === b.id).map((cb) => db.courses.find((c) => c.id === cb.course_id)!).filter((c) => c.tenant_id === req.ctx.tenantId).map((c) => c.code);
  return { book: { ...b, courses } };
}));

app.post('/api/kit/courses', wrap((req) => {
  const u = req.ctx.user;
  const c = scoped(db.courses, u.tenant_id).find((x) => x.id === req.body.course_id);
  if (!c) throw new HttpError(404, 'Course not found');
  if (!db.user_courses.some((uc) => uc.user_id === u.id && uc.course_id === c.id)) {
    db.user_courses.push({ tenant_id: u.tenant_id, user_id: u.id, course_id: c.id, added_at: now() });
    for (const cb of db.course_books.filter((x) => x.course_id === c.id)) {
      const b = db.books.find((x) => x.id === cb.book_id)!;
      if (db.needs.some((n) => n.user_id === u.id && n.book_id === b.id && n.status !== 'closed')) continue;
      db.needs.push({
        id: id('ned'), tenant_id: u.tenant_id, user_id: u.id, kind: 'textbook', course_id: c.id, book_id: b.id,
        free_text: `${c.code} textbook: ${b.title}${b.edition ? `, ${b.edition}th ed.` : ''}`.replace('1th', '1st').replace('2th', '2nd').replace('3th', '3rd'),
        requirements: [
          { key: 'isbn', label: `ISBN ${b.isbn}`, value: b.isbn, must: true, weight: 3 },
          ...(b.edition ? [{ key: 'edition', label: `Edition ${b.edition}`, value: b.edition, must: true, weight: 3 }] : []),
        ],
        status: 'watching', prefs: {}, parsed_by: 'rules', created_at: now(),
      });
    }
  }
  save();
  return kitView(u);
}));

app.delete('/api/kit/courses/:id', wrap((req) => {
  const u = req.ctx.user;
  db.user_courses = db.user_courses.filter((uc) => !(uc.user_id === u.id && uc.course_id === req.params.id));
  db.needs.filter((n) => n.user_id === u.id && n.course_id === req.params.id).forEach((n) => (n.status = 'closed'));
  save();
  return kitView(u);
}));

app.post('/api/kit/choice', wrap((req) => {
  const u = req.ctx.user;
  const { book_id, source } = req.body;
  const opts = bookOptions(book_id, u);
  const o = opts.find((x) => x.source === source);
  if (!o) throw new HttpError(400, 'Not an option for this book');
  if (source === 'campus') throw new HttpError(400, 'Claim the campus copy instead');
  db.kit_choices = db.kit_choices.filter((k) => !(k.user_id === u.id && k.book_id === book_id));
  if (!req.body.clear) db.kit_choices.push({ tenant_id: u.tenant_id, user_id: u.id, book_id, source, cents: o.cents });
  db.needs.filter((n) => n.user_id === u.id && n.book_id === book_id && n.status !== 'closed').forEach((n) => (n.status = req.body.clear ? 'watching' : 'sorted'));
  save();
  return kitView(u);
}));

/* ---------- Listings ---------- */

function visibleListing(req: Request): Listing {
  const l = visibleListingsFor(req.ctx.user).find((x) => x.id === req.params.id);
  if (!l) throw new HttpError(404, 'Listing not found');
  return l;
}

app.get('/api/listings', wrap((req) => {
  const u = req.ctx.user;
  if (req.query.mine) {
    return db.listings.filter((l) => l.seller_id === u.id && l.status !== 'sold').sort((a, b) => b.created_at - a.created_at).map((l) => ({
      ...listingCard(l, u), last_confirmed_at: l.last_confirmed_at,
      trades: db.trades.filter((t) => t.listing_id === l.id && isActive(t)).map((t) => t.id),
      questions: db.questions.filter((q) => q.listing_id === l.id && !q.answer).length,
    }));
  }
  const kind = req.query.kind as Kind | undefined;
  return visibleListingsFor(u)
    .filter((l) => l.status === 'active' && freshness(l) !== 'hidden' && (!kind || l.kind === kind) && (l.tenant_id === u.tenant_id || req.query.cross))
    .slice(0, 60).map((l) => listingCard(l, u));
}));

app.get('/api/listings/:id', wrap((req) => passportView(visibleListing(req), req.ctx.user, req.query.need as string | undefined)));
app.get('/api/listings/:id/market', wrap((req) => marketView(visibleListing(req))));

app.post('/api/listings/suggest-price', wrap((req) => {
  const u = req.ctx.user;
  const { category, condition, lineage_from } = req.body;
  const src = lineage_from ? db.listings.find((l) => l.id === lineage_from) : null;
  const stamps = src ? stampCount(src.lineage_id) : 0;
  const sp = suggestPrice(u.tenant_id, String(category ?? 'Other'), Number(condition ?? 90), stamps);
  return sp;
}));

app.get('/api/listings/:id/relist-draft', wrap((req) => {
  const l = db.listings.find((x) => x.id === req.params.id);
  const bought = !!l && db.trades.some((t) => t.listing_id === l.id && t.buyer_id === req.ctx.user.id && (t.state === 'COMPLETE' || t.state === 'RESOLVED'));
  if (!l || !bought) throw new HttpError(404, 'You can relist things you bought on Passport');
  return { kind: l.kind, title: l.title, category: l.category, details: { ...l.details }, condition: l.condition, photo: l.photo ?? null, photos: photosOf(l), lineage_from: l.id, stamps: stampCount(l.lineage_id) };
}));

app.post('/api/listings', wrap((req) => {
  const u = req.ctx.user;
  const t = tenantById(u.tenant_id);
  const b = req.body;
  const kind = b.kind as Kind;
  if (!KINDS.includes(kind)) throw new HttpError(400, 'Pick what you are selling');
  if (kind === 'ticket' && !t.config.features.tickets) throw new HttpError(400, 'Tickets are off on this campus');
  if (kind === 'service' && !t.config.features.services) throw new HttpError(400, 'Tutoring is off on this campus');
  let title = String(b.title ?? '').trim().slice(0, 80);
  const details: Record<string, any> = {};
  let category = String(b.category ?? 'Other');
  let condition = 0;
  let ask = Math.round(Number(b.ask_cents));
  if (kind === 'item' || kind === 'textbook') {
    const step = (b.condition_step ?? 'good') as ConditionStep;
    if (!CONDITION_STEPS[step]) throw new HttpError(400, 'Pick a condition');
    condition = CONDITION_STEPS[step].score;
  }
  if (kind === 'textbook') {
    const isbn = String(b.details?.isbn ?? '').replace(/[^0-9xX]/g, '');
    const book = isbn ? db.books.find((x) => x.isbn === isbn) : null;
    if (book) { details.isbn = book.isbn; details.edition = book.edition; details.author = book.author; title ||= `${book.title}${book.edition ? `, ${book.edition}th ed.` : ''}`; }
    else if (isbn) details.isbn = isbn;
    if (b.details?.edition) details.edition = Number(b.details.edition);
    details.highlights = ['none', 'some', 'heavy'].includes(b.details?.highlights) ? b.details.highlights : 'none';
    if (b.details?.course) details.course = String(b.details.course).toUpperCase().slice(0, 12);
    category = details.isbn ? `isbn:${details.isbn}` : 'textbook';
  }
  if (kind === 'ticket') {
    const d = b.details ?? {};
    const face = Math.round(Number(d.face_value_cents));
    if (!(face > 0)) throw new HttpError(400, 'Enter the face value');
    const cap = Math.floor(face * t.config.ticketPriceCap);
    if (ask > cap) throw new HttpError(400, `Ticket prices are capped at face value x ${t.config.ticketPriceCap} here: max ${money(cap)}`);
    Object.assign(details, {
      event: String(d.event ?? '').slice(0, 80), date: String(d.date ?? '').slice(0, 10), section: String(d.section ?? '').slice(0, 12), row: String(d.row ?? '').slice(0, 8),
      quantity: Math.max(1, Math.min(8, Number(d.quantity) || 1)), face_value_cents: face, transfer_method: String(d.transfer_method ?? 'App transfer'), proof: !!d.proof, proof_url: d.proof || null,
    });
    if (!details.event || !details.date) throw new HttpError(400, 'Add the event and date');
    title ||= `${details.quantity > 1 ? `${details.quantity} tickets: ` : ''}${details.event}`;
    category = 'Tickets';
  }
  if (kind === 'service') {
    const d = b.details ?? {};
    const rate = Math.round(Number(d.hourly_cents));
    if (!(rate > 0)) throw new HttpError(400, 'Set an hourly rate');
    const avail = (Array.isArray(d.availability) ? d.availability : []).filter((w: any) => w.weekday >= 0 && w.weekday <= 6 && w.hour >= 0 && w.hour <= 23);
    if (!avail.length) throw new HttpError(400, 'Tap at least one time block you are free');
    Object.assign(details, {
      course: String(d.course ?? '').toUpperCase().slice(0, 12), skills: (d.skills ?? []).slice(0, 6), hourly_cents: rate,
      first_discount_pct: Math.max(0, Math.min(50, Number(d.first_discount_pct) || 0)), availability: avail, mode: d.mode === 'video' ? 'video' : 'in_person',
      video_url: d.mode === 'video' ? String(d.video_url ?? '') : undefined, bio: String(d.bio ?? '').slice(0, 200),
    });
    ask = rate;
    title ||= `${details.course || 'Tutoring'} tutoring`;
    category = 'Tutoring';
  }
  if (kind === 'item' && !b.category) category = 'Other';
  if (!title) throw new HttpError(400, 'Add a title');
  if (!(ask > 0)) throw new HttpError(400, 'Set a price');
  const floor = b.floor_cents != null && b.floor_cents !== '' ? Math.round(Number(b.floor_cents)) : null;
  if (floor != null && (floor <= 0 || floor > ask)) throw new HttpError(400, 'Your floor has to be at or below your price');
  const windows = (Array.isArray(b.free_windows) ? b.free_windows : []).filter((w: any) => w.weekday >= 0 && w.weekday <= 6 && w.hour >= 0 && w.hour <= 23);
  if ((kind === 'item' || kind === 'textbook') && !windows.length) throw new HttpError(400, 'Tap at least one time you are usually free');
  const photos = (Array.isArray(b.photos) ? b.photos : b.photo ? [b.photo] : [])
    .map(String).filter((p: string) => /^\/uploads\/[a-f0-9]+\.(jpg|png|webp)$/.test(p) || /^\/seed\/photos\/[a-z0-9-]+\.jpg$/.test(p)).slice(0, 5);
  if ((kind === 'item' || kind === 'textbook') && !photos.length) throw new HttpError(400, kind === 'textbook' ? 'Add at least one photo: the cover, ideally a few inside pages too' : 'Add at least one photo');

  const src = b.lineage_from ? db.listings.find((x) => x.id === b.lineage_from) : null;
  const ownsSrc = src && db.trades.some((tr) => tr.listing_id === src.id && tr.buyer_id === u.id && tr.state === 'COMPLETE');
  const lineage_id = ownsSrc ? src!.lineage_id : id('lin');
  const sp = kind === 'item' || kind === 'textbook' ? suggestPrice(u.tenant_id, category, condition, stampCount(lineage_id)) : null;
  const l: Listing = {
    id: id('lst'), tenant_id: u.tenant_id, seller_id: u.id, kind, title, category, details, condition, ask_cents: ask, floor_cents: floor,
    suggested_cents: sp?.S_cents ?? null, arena_on: !!b.arena_on && (kind === 'item' || kind === 'textbook') && t.config.features.arena,
    visibility: b.visibility === 'open' && t.config.features.crossCampus ? 'open' : 'campus', photo: photos[0], photos,
    notes_for_buyer: b.notes_for_buyer ? String(b.notes_for_buyer).replace(/https?:\/\/\S+/g, '').slice(0, 200) : undefined,
    lineage_id, free_windows: windows, last_confirmed_at: now(), status: 'active', created_at: now(),
  };
  db.listings.push(l);
  if (ownsSrc) db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id, type: 'owner', payload: { from: userById(src!.seller_id)?.handle, to: u.handle }, created_at: now() });
  db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id, type: 'listed', payload: { by: u.handle, cents: ask, condition }, created_at: now() });
  alertMatches(l);
  save();
  return { id: l.id };
}));

app.post('/api/listings/:id/confirm', wrap((req) => {
  const l = db.listings.find((x) => x.id === req.params.id && x.seller_id === req.ctx.user.id);
  if (!l) throw new HttpError(404, 'Listing not found');
  l.last_confirmed_at = now();
  if (l.status === 'hidden') l.status = 'active';
  db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id: l.lineage_id, type: 'confirmed', payload: { by: req.ctx.user.handle }, created_at: now() });
  save();
  return { ok: true };
}));

app.post('/api/listings/:id/withdraw', wrap((req) => {
  const l = db.listings.find((x) => x.id === req.params.id && x.seller_id === req.ctx.user.id);
  if (!l) throw new HttpError(404, 'Listing not found');
  if (l.status === 'held') throw new HttpError(409, 'Someone is holding it. Cancel that trade first.');
  l.status = 'hidden';
  l.last_confirmed_at = 0;
  save();
  return { ok: true };
}));

app.post('/api/listings/:id/claim', wrap((req) => {
  const l = visibleListing(req);
  const t = claimListing(l.id, req.ctx.user.id, req.body.need_id ?? null);
  return { trade_id: t.id };
}));

app.post('/api/questions/:id/answer', wrap((req) => answerQuestion(req.params.id, req.ctx.user.id, String(req.body.answer))));

/* ---------- Trades ---------- */

function myTrade(req: Request) {
  const t = db.trades.find((x) => x.id === req.params.id);
  if (!t || !tradeParty(t, req.ctx.user.id)) {
    if (t && req.ctx.user.is_admin && req.ctx.user.tenant_id === t.tenant_id) return t;
    throw new HttpError(404, 'Trade not found');
  }
  return t;
}

app.get('/api/trades', wrap((req) => {
  const u = req.ctx.user;
  const mine = db.trades.filter((t) => tradeParty(t, u.id)).sort((a, b) => b.created_at - a.created_at);
  const myListingIds = new Set(db.listings.filter((l) => l.seller_id === u.id).map((l) => l.id));
  return {
    active: mine.filter(isActive).map((t) => tradeSummary(t, u)),
    past: mine.filter((t) => !isActive(t)).slice(0, 40).map((t) => tradeSummary(t, u)),
    questions: db.questions.filter((q) => myListingIds.has(q.listing_id) && !q.answer).map((q) => ({ ...q, listing_title: db.listings.find((l) => l.id === q.listing_id)?.title })),
  };
}));

app.get('/api/trades/:id', wrap((req) => {
  const u = req.ctx.user;
  const t = myTrade(req);
  const l = listingOf(t);
  const view = describeTrade(t, u.id);
  const slot = slotOf(t);
  const zone = slot && slot.mode === 'in_person' ? tenantById(slot.zone_tenant_id).config.safeZones.find((z) => z.id === slot.safe_zone) : null;
  const match = db.arena_matches.filter((m) => m.trade_id === t.id).at(-1);
  const isBuyer = t.buyer_id === u.id;
  return {
    trade: { ...t, payment_intent: t.payment_intent ? t.payment_intent.slice(0, 14) + '...' : null },
    role: tradeParty(t, u.id) ?? 'admin',
    listing: listingCard(l, userById(t.buyer_id)!),
    notes_for_buyer: l.notes_for_buyer ?? null,
    counterpart: publicUser(userById(isBuyer ? t.seller_id : t.buyer_id)),
    carrier: t.carrier_id ? publicUser(userById(t.carrier_id)) : null,
    view,
    slot: slot ? { ...slot, label: describeSlot(slot), zone } : null,
    slot_options: t.state === 'PRICED' && isBuyer ? slotOptions(t).map((o) => ({ ...o, pay_mode: payModeFor(t, o.mode) })) : [],
    safe_zones: tenantById(slot?.zone_tenant_id ?? t.tenant_id).config.safeZones,
    duel: match ? duelView(match, u.id) : null,
    events: db.trade_events.filter((e) => e.trade_id === t.id).map((e) => ({ type: e.type, actor: e.actor_id === 'system' ? 'system' : userById(e.actor_id)?.handle, at: e.created_at })),
    messages: db.messages.filter((m) => m.trade_id === t.id).length,
    reasons: REASONS,
    rated: db.ratings.some((r) => r.trade_id === t.id && r.rater_id === u.id),
    server_now: now(),
  };
}));

const CLIENT_EVENTS = new Set(['accept_ask', 'offer', 'accept_offer', 'decline_offer', 'book', 'arrive', 'transfer_sent', 'confirm_receipt', 'cancel', 'problem']);

app.post('/api/trades/:id/event', wrap(async (req) => {
  const t = myTrade(req);
  const event = String(req.body.event);
  if (!CLIENT_EVENTS.has(event)) throw new HttpError(400, 'Not allowed');
  const payload = { ...(req.body.payload ?? {}) };
  if (event === 'arrive') payload.distance_m = geofenceDistance(t, req.body.payload?.lat, req.body.payload?.lng);
  await advanceTrade(t.id, event, req.ctx.user.id, payload);
  return { ok: true };
}));

/* ---------- Scan: signed, 60-second, two-direction ---------- */

app.post('/api/trades/:id/token', wrap((req) => {
  const t = myTrade(req);
  if (t.state !== 'BOOKED') throw new HttpError(409, 'Codes only exist once a trade is booked');
  const w = scanWindow(t);
  if (!w) throw new HttpError(400, 'No scan for this trade');
  if (now() < w.opens) throw new HttpError(425, `Your code appears 10 minutes before the slot`);
  if (now() > w.closes) throw new HttpError(410, 'The handoff window has closed');
  return { ...issueScanToken(t.id, req.ctx.user.id, now()), server_now: now() };
}));

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function geofenceDistance(t: ReturnType<typeof myTrade>, lat: any, lng: any): number | null {
  const s = slotOf(t);
  if (!s || s.mode !== 'in_person' || typeof lat !== 'number' || typeof lng !== 'number') return null;
  const z = tenantById(s.zone_tenant_id).config.safeZones.find((x) => x.id === s.safe_zone);
  return z ? Math.round(haversine({ lat, lng }, z)) : null;
}

app.post('/api/scan', wrap(async (req) => {
  const u = req.ctx.user;
  let tradeId: string, shownBy: string;
  if (req.body.token) {
    const p = verify<ScanPayload>(req.body.token);
    if (!p || p.k !== 'scan') throw new HttpError(400, 'That is not a Passport handoff code');
    if (now() - p.issued_at > SCAN_TTL_MS) throw new HttpError(410, 'That code expired. Ask them to keep the screen open.');
    tradeId = p.trade_id;
    shownBy = p.user_id;
  } else if (req.body.code && req.body.trade_id) {
    tradeId = String(req.body.trade_id);
    const t0 = db.trades.find((x) => x.id === tradeId);
    const mySide = t0 && sideOf(t0, u.id);
    if (!t0 || !mySide) throw new HttpError(404, 'Trade not found');
    const others = mySide === 'buyer' ? [t0.seller_id, t0.carrier_id].filter(Boolean) as string[] : [t0.buyer_id];
    const hit = others.find((o) => matchCode(String(req.body.code).replace(/\D/g, ''), t0.id, o, now()) != null);
    if (!hit) throw new HttpError(400, 'That code does not match. Codes change every 30 seconds.');
    shownBy = hit;
  } else throw new HttpError(400, 'Scan a code or type the 6 digits');

  const t = db.trades.find((x) => x.id === tradeId);
  if (!t || t.state !== 'BOOKED') throw new HttpError(409, 'This trade is not waiting for a handoff');
  const mySide = sideOf(t, u.id), theirSide = sideOf(t, shownBy);
  if (!mySide) throw new HttpError(403, 'You are not part of this trade');
  if (shownBy === u.id || mySide === theirSide) throw new HttpError(400, 'Scan the other person\'s code, not your own');
  const w = scanWindow(t);
  if (!w || now() < w.opens || now() > w.closes) throw new HttpError(409, 'Scans only work from 10 minutes before the slot to 15 minutes after');
  const ten = tenantById(slotOf(t)!.zone_tenant_id);
  const dist = geofenceDistance(t, req.body.lat, req.body.lng);
  if (ten.config.geofenceRequired && (dist == null || dist > 75)) throw new HttpError(403, dist == null ? 'Turn on location to scan' : `You are ${dist} m from the safe zone. Get within 75 m.`);
  const both = recordScan(t, u.id, req.body.token ? 'qr' : 'code');
  if (both) await systemEvent(t.id, 'both_scanned');
  save();
  return { ok: true, complete: both, distance_m: dist, state: db.trades.find((x) => x.id === t.id)!.state };
}));

app.post('/api/trades/:id/checkin', wrap(async (req) => {
  const t = myTrade(req);
  const s = slotOf(t);
  if (t.state !== 'BOOKED' || !s || s.mode !== 'video') throw new HttpError(409, 'Tap check-in is only for video sessions');
  const w = scanWindow(t)!;
  if (now() < w.opens || now() > w.closes) throw new HttpError(409, 'Check-in opens 10 minutes before the session');
  const both = recordScan(t, req.ctx.user.id, 'tap');
  if (both) await systemEvent(t.id, 'both_scanned');
  return { ok: true, complete: both };
}));

/* ---------- After the trade ---------- */

app.post('/api/trades/:id/reason', wrap((req) => {
  const t = myTrade(req);
  if (t.buyer_id !== req.ctx.user.id) throw new HttpError(403, 'Only the buyer answers this');
  if (!(req.body.reason in REASONS)) throw new HttpError(400, 'Pick a reason');
  const need = applyNearMiss(t, req.body.reason);
  return { ok: true, need_id: need?.id ?? null };
}));

app.post('/api/trades/:id/verify', wrap((req) => {
  const t = myTrade(req);
  if (t.buyer_id !== req.ctx.user.id || t.state !== 'COMPLETE') throw new HttpError(409, 'Only the buyer, after the handoff');
  const l = listingOf(t);
  if (db.passport_events.some((e) => e.type === 'verified' && e.payload.trade_id === t.id)) return { ok: true };
  db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id: l.lineage_id, type: 'verified', payload: { by: req.ctx.user.handle, matched: !!req.body.matched, condition: l.condition, trade_id: t.id }, created_at: now() });
  save();
  return { ok: true };
}));

app.post('/api/trades/:id/rate', wrap((req) => {
  const t = myTrade(req);
  if (t.buyer_id !== req.ctx.user.id || t.state !== 'COMPLETE' || (t.escrow !== 'captured' && t.pay_mode !== 'reservation')) throw new HttpError(409, 'Ratings come only from completed, verified sessions');
  const stars = Math.max(1, Math.min(5, Math.round(Number(req.body.stars))));
  if (!db.ratings.some((r) => r.trade_id === t.id)) db.ratings.push({ id: id('rtg'), trade_id: t.id, rater_id: req.ctx.user.id, ratee_id: t.seller_id, stars, created_at: now() });
  save();
  return { ok: true };
}));

/* ---------- Price Duel ---------- */

function myDuel(req: Request) {
  const m = db.arena_matches.find((x) => x.id === req.params.id);
  if (!m || (m.p1_id !== req.ctx.user.id && m.p2_id !== req.ctx.user.id)) throw new HttpError(404, 'Duel not found');
  return m;
}
app.post('/api/trades/:id/duel', wrap((req) => {
  const t = myTrade(req);
  const existing = db.arena_matches.find((m) => m.trade_id === t.id && m.state !== 'priced');
  const m = existing ?? startDuel(t.id, req.ctx.user.id);
  openDuel(m, req.ctx.user.id);
  return duelView(m, req.ctx.user.id);
}));
app.get('/api/duels/:id', wrap((req) => duelView(myDuel(req), req.ctx.user.id)));
app.post('/api/duels/:id/stakes', wrap((req) => {
  const m = myDuel(req);
  setStakes(m, req.ctx.user.id, req.body.buyer_wins, req.body.seller_wins);
  return duelView(m, req.ctx.user.id);
}));
app.post('/api/duels/:id/accept', wrap((req) => {
  const m = myDuel(req);
  acceptStakes(m, req.ctx.user.id);
  return duelView(m, req.ctx.user.id);
}));
app.post('/api/duels/:id/move', wrap(async (req) => {
  const m = myDuel(req);
  playMove(m, req.ctx.user.id, String(req.body.move));
  await lockDuelPrices();
  return duelView(m, req.ctx.user.id);
}));
app.post('/api/duels/:id/pick', wrap(async (req) => {
  const m = myDuel(req);
  await advanceTrade(m.trade_id, 'arena_price', req.ctx.user.id, { cents: req.body.cents });
  return { ok: true };
}));
app.post('/api/duels/:id/autoplay', wrap(async (req) => {
  if (!DEMO) throw new HttpError(403, 'Demo only');
  const m = myDuel(req);
  autoplayOther(m, req.ctx.user.id);
  await lockDuelPrices();
  return duelView(m, req.ctx.user.id);
}));

/* ---------- Trade chat (fallback) ---------- */

const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|me|ly|app|co|gg|link)\b|data:image)/i;

app.get('/api/trades/:id/messages', wrap((req) => {
  const t = myTrade(req);
  const archived = !!t.ended_at && now() - t.ended_at > 7 * DAY;
  return {
    archived,
    messages: archived ? [] : db.messages.filter((m) => m.trade_id === t.id).map((m) => ({ id: m.id, body: m.reported ? 'Reported message hidden' : m.body, mine: m.sender_id === req.ctx.user.id, at: m.created_at, reported: m.reported, handle: userById(m.sender_id)?.handle })),
  };
}));
app.post('/api/trades/:id/messages', wrap((req) => {
  const t = myTrade(req);
  if (!tradeParty(t, req.ctx.user.id)) throw new HttpError(403, 'Only people in this trade can message');
  if (t.ended_at && now() - t.ended_at > 7 * DAY) throw new HttpError(410, 'This chat was archived 7 days after the trade ended');
  const body = String(req.body.body ?? '').trim();
  if (!body) throw new HttpError(400, 'Type a message');
  if (body.length > 400) throw new HttpError(400, 'Keep it under 400 characters');
  if (LINKISH.test(body)) throw new HttpError(400, 'Links and images are not allowed in trade chat');
  db.messages.push({ id: id('msg'), tenant_id: t.tenant_id, trade_id: t.id, sender_id: req.ctx.user.id, body, created_at: now(), reported: false });
  const otherId = t.buyer_id === req.ctx.user.id ? t.seller_id : t.buyer_id;
  const recent = db.notifications.find((n) => n.user_id === otherId && n.type === 'message' && n.link === `/trade/${t.id}` && !n.read);
  if (!recent) notify(otherId, 'message', `Message from @${req.ctx.user.handle}`, body.slice(0, 80), `/trade/${t.id}`);
  save();
  return { ok: true };
}));
app.post('/api/messages/:id/report', wrap((req) => {
  const m = db.messages.find((x) => x.id === req.params.id);
  const t = m && db.trades.find((x) => x.id === m.trade_id);
  if (!m || !t || !tradeParty(t, req.ctx.user.id) || m.sender_id === req.ctx.user.id) throw new HttpError(404, 'Message not found');
  m.reported = true;
  save();
  return { ok: true };
}));

/* ---------- Explore map ---------- */

app.get('/api/explore', wrap((req) => {
  const t = tenantById(req.ctx.tenantId);
  if (t.config.features.explore === false) throw new HttpError(404, 'Explore is off on this campus');
  const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));
  return exploreView(req.ctx.user, { zone: req.query.zone as string | undefined, lat: num(req.query.lat), lng: num(req.query.lng), budget: num(req.query.budget) });
}));

/* ---------- Carriers ---------- */

app.get('/api/carriers', wrap((req) => {
  const tid = req.ctx.tenantId;
  return {
    trips: db.carriers.filter((c) => (c.from_tenant === tid || c.to_tenant === tid) && c.travels_on > now()).sort((a, b) => a.travels_on - b.travels_on).map((c) => ({
      ...c, carrier: publicUser(userById(c.user_id)), from: tenantById(c.from_tenant).short, to: tenantById(c.to_tenant).short, mine: c.user_id === req.ctx.user.id,
      booked: db.trades.filter((t) => t.carrier_id === c.user_id && isActive(t)).length,
    })),
    shuttles: tenantById(tid).config.shuttleDays.map((s) => ({ ...s, to_short: db.tenants.find((x) => x.slug === s.to)?.short })),
    campuses: db.tenants.filter((t) => t.id !== tid).map((t) => ({ id: t.id, short: t.short, name: t.name })),
    open_listings: db.listings.filter((l) => l.visibility === 'open' && l.status === 'active' && l.tenant_id !== tid && !tripTenantIds(req.ctx.user).includes(l.tenant_id)).slice(0, 20).map((l) => listingCard(l, req.ctx.user)),
    // Each upcoming trip of mine opens the destination campus: everything active there, not only "open" listings.
    trip_shops: db.carriers.filter((c) => c.user_id === req.ctx.user.id && c.travels_on > now()).sort((a, b) => a.travels_on - b.travels_on)
      .filter((c, i, all) => all.findIndex((x) => x.to_tenant === c.to_tenant) === i)
      .map((c) => ({
        trip_id: c.id, to: tenantById(c.to_tenant).short, to_name: tenantById(c.to_tenant).name, travels_on: c.travels_on,
        listings: db.listings.filter((l) => l.tenant_id === c.to_tenant && l.status === 'active' && freshness(l) !== 'hidden' && (l.kind === 'item' || l.kind === 'textbook'))
          .slice(0, 24).map((l) => listingCard(l, req.ctx.user)),
      })),
  };
}));
app.post('/api/carriers', wrap((req) => {
  const u = req.ctx.user;
  const to = db.tenants.find((t) => t.id === req.body.to_tenant && t.id !== u.tenant_id);
  if (!to) throw new HttpError(400, 'Pick the campus you are driving to');
  const at = Number(req.body.travels_on);
  if (!(at > now())) throw new HttpError(400, 'Pick a future date');
  db.carriers.push({ id: id('car'), tenant_id: u.tenant_id, user_id: u.id, from_tenant: u.tenant_id, to_tenant: to.id, travels_on: at, tip_cents: Math.max(0, Math.round(Number(req.body.tip_cents) || 300)), seats: 3, note: String(req.body.note ?? '').slice(0, 120) });
  save();
  return { ok: true };
}));
app.delete('/api/carriers/:id', wrap((req) => {
  db.carriers = db.carriers.filter((c) => !(c.id === req.params.id && c.user_id === req.ctx.user.id));
  save();
  return { ok: true };
}));

/* ---------- Admin: disputes ---------- */

app.get('/api/admin/disputes', wrap((req) => {
  if (!req.ctx.user.is_admin) throw new HttpError(403, 'Admins only');
  return scoped(db.trades, req.ctx.tenantId).filter((t) => t.state === 'DISPUTED').map((t) => {
    const l = listingOf(t);
    return {
      id: t.id, title: l.title, price_cents: t.price_cents, buyer: publicUser(userById(t.buyer_id)), seller: publicUser(userById(t.seller_id)),
      reason: db.outcomes.filter((o) => o.trade_id === t.id && o.result === 'disputed').at(-1)?.reason ?? null,
      scans: db.scans.filter((s) => s.trade_id === t.id).map((s) => ({ handle: userById(s.user_id)?.handle, at: s.scanned_at, method: s.method })),
      events: db.trade_events.filter((e) => e.trade_id === t.id).map((e) => ({ type: e.type, actor: userById(e.actor_id)?.handle ?? 'system', at: e.created_at })),
      passport: db.passport_events.filter((e) => e.lineage_id === l.lineage_id).map((e) => ({ type: e.type, payload: e.payload, at: e.created_at })),
      messages: db.messages.filter((m) => m.trade_id === t.id).map((m) => ({ handle: userById(m.sender_id)?.handle, body: m.body, at: m.created_at, reported: m.reported })),
      transfer_proof: t.transfer_proof ?? null, slot: describeSlot(slotOf(t)),
    };
  });
}));
app.post('/api/admin/disputes/:id/resolve', wrap(async (req) => {
  if (!req.ctx.user.is_admin) throw new HttpError(403, 'Admins only');
  if (!scoped(db.trades, req.ctx.tenantId).some((t) => t.id === req.params.id)) throw new HttpError(404, 'Trade not found');
  const decision = req.body.decision === 'refund' ? 'refund' : 'release';
  await advanceTrade(req.params.id, 'resolve', req.ctx.user.id, { decision });
  return { ok: true };
}));

/* ---------- Platform admin: add a campus, check isolation ---------- */

const PLATFORM_ADMINS = new Set((process.env.PLATFORM_ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
function platformAdmin(req: Request) {
  const u = req.ctx.user;
  if (!u.is_admin || !(DEMO || PLATFORM_ADMINS.has(u.email))) throw new HttpError(403, 'Only Passport platform admins add campuses');
}

app.get('/api/admin/campuses', wrap((req) => {
  platformAdmin(req);
  return {
    campuses: db.tenants.map((t) => ({
      slug: t.slug, name: t.name, short: t.short, domains: t.domains, city: t.config.city,
      users: scoped(db.users, t.id).length, listings: scoped(db.listings, t.id).length, courses: scoped(db.courses, t.id).length,
      safe_zones: t.config.safeZones.length,
    })),
    csv_header: COURSE_CSV_HEADER,
  };
}));

app.post('/api/admin/campuses', wrap((req) => {
  platformAdmin(req);
  const { tenant, errors, filled } = validateCampus(req.body.config, db);
  const csv = String(req.body.courses_csv ?? '');
  const parsed = parseCoursesCsv(csv);
  const allErrors = [...errors, ...parsed.errors];
  const preview = tenant && {
    slug: tenant.slug, name: tenant.name, short: tenant.short, domains: tenant.domains, city: tenant.config.city,
    safe_zones: tenant.config.safeZones.map((z) => z.name), housing: tenant.config.housing.map((h) => h.name),
    courses: parsed.rows.length,
    books_matched: parsed.rows.filter((r) => r.isbn && db.books.some((b) => b.isbn === r.isbn)).length,
    books_new: new Set(parsed.rows.filter((r) => r.isbn && !db.books.some((b) => b.isbn === r.isbn)).map((r) => r.isbn)).size,
    admin_email: `admin@${tenant.domains[0]}`,
  };
  if (allErrors.length || !tenant) return { ok: false, errors: allErrors, filled, preview };
  if (req.body.dry_run) return { ok: true, errors: [], filled, preview, dry_run: true };
  db.tenants.push(tenant);
  for (const d of tenant.domains) db.tenant_domains.push({ domain: d, tenant_id: tenant.id });
  installCourses(db, tenant, parsed.rows);
  baselineSales(db, tenant, now());
  db.users.push(demoAdminFor(tenant, now()));
  writeCampusFiles(tenant, csv);
  save();
  return { ok: true, errors: [], filled, preview };
}));

app.get('/api/admin/isolation', wrap(async (req) => {
  if (!req.ctx.user.is_admin) throw new HttpError(403, 'Admins only');
  if (!DEMO) throw new HttpError(403, 'The isolation check signs in demo accounts, so it only runs in demo mode');
  const checks = await runIsolationChecks(`http://127.0.0.1:${PORT}`);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}));

/* ---------- Uploads (photos, ticket proof) ---------- */

app.post('/api/upload', wrap((req) => {
  const m = String(req.body.data_url ?? '').match(/^data:image\/(jpeg|png|webp);base64,(.+)$/);
  if (!m) throw new HttpError(400, 'Upload a JPEG, PNG or WebP image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) throw new HttpError(413, 'Image is too large');
  const name = `${crypto.randomBytes(10).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: `/uploads/${name}` };
}));

/* ---------- Demo controls (said out loud on stage) ---------- */

app.post('/api/demo/clock', wrap(async (req) => {
  if (!DEMO) throw new HttpError(403, 'Demo only');
  const minutes = Math.max(-60 * 24, Math.min(60 * 48, Number(req.body.minutes) || 0));
  db.meta.clock_offset_ms = req.body.reset ? 0 : db.meta.clock_offset_ms + minutes * MIN;
  await runTimers();
  return { clock_offset_ms: db.meta.clock_offset_ms, server_now: now() };
}));

app.post('/api/demo/payments', wrap((req) => {
  if (!DEMO) throw new HttpError(403, 'Demo only');
  db.meta.payments_mode = req.body.mode === 'escrow' ? 'escrow' : 'reservation';
  save();
  return { payments: db.meta.payments_mode };
}));

app.post('/api/demo/both-scan', wrap(async (req) => {
  if (!DEMO) throw new HttpError(403, 'Demo only');
  const t = db.trades.find((x) => x.id === req.body.trade_id && tradeParty(x, req.ctx.user.id));
  if (!t || t.state !== 'BOOKED') throw new HttpError(409, 'Trade must be booked');
  if (t.kind === 'ticket') throw new HttpError(400, 'Tickets do not scan');
  const s = slotOf(t)!;
  if (now() < s.starts_at - 10 * MIN) db.meta.clock_offset_ms += s.starts_at - now();
  const sides = new Set(db.scans.filter((x) => x.trade_id === t.id).map((x) => sideOf(t, x.user_id)));
  let both = false;
  if (!sides.has('buyer')) both = recordScan(t, t.buyer_id, 'demo');
  if (!sides.has('seller')) both = recordScan(t, t.carrier_id ?? t.seller_id, 'demo');
  if (both) await systemEvent(t.id, 'both_scanned');
  return { ok: true, state: t.state, clock_offset_ms: db.meta.clock_offset_ms };
}));

app.post('/api/demo/reset', wrap(() => {
  if (!DEMO) throw new HttpError(403, 'Demo only');
  replaceDB(seed());
  db.users.forEach((u) => refreshTrust(u.id));
  save();
  return { ok: true };
}));

/* ---------- Errors and static ---------- */

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'Something went wrong' });
});

const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

setInterval(() => runTimers().catch((e) => console.error('timers', e)), 20_000);

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`Passport API on http://localhost:${PORT}  (payments: ${paymentsMode()}, escrow: ${escrowMode}, parser: ${llmMode}, demo: ${DEMO})`);
});
