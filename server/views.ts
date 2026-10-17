import { db, now, id, save, Listing, Need, User, visibleListingsFor, tripTenantIds, tenantById, userById, DAY, scoped } from './db.js';
import {
  fitScore, reach, reliability, pickMeetingPoint, walkMinutes, freshness, suggestPrice, stampCount, conditionStep, CONDITION_STEPS,
  publicUser, trustLevel, trustCredit, money, plural, ordinal,
} from './logic.js';
import { explainFit } from './llm.js';
import { describeTrade, isActive, nextCarrier, slotLabel, listingOf } from './trade.js';

/* ---------- Reach for one buyer/listing pair ---------- */

export function reachFor(buyer: User, l: Listing) {
  const seller = userById(l.seller_id)!;
  const cross = l.tenant_id !== buyer.tenant_id;
  if (l.kind === 'ticket') return { minutes: 0, cross, zone: null as string | null, label: 'Digital transfer', carrier: cross ? carrierInfo(l, buyer) : null };
  if (l.kind === 'service' && l.details.mode === 'video') return { minutes: 0, cross, zone: null, label: 'Video session', carrier: null };
  if (cross && tripTenantIds(buyer).includes(l.tenant_id)) {
    const trip = ownTrip(buyer.id, l.tenant_id)!;
    const st = tenantById(l.tenant_id);
    const zone = [...st.config.safeZones].sort((a, b) => walkMinutes(st, seller.housing, a.id) - walkMinutes(st, seller.housing, b.id))[0];
    const days = Math.max(0, Math.round((trip.travels_on - now()) / DAY));
    return { minutes: 10, cross, zone: zone.name, label: `On your ${slotLabel(trip.travels_on).split(' ')[0]} trip`, carrier: { label: `You are driving to ${st.short} ${slotLabel(trip.travels_on)}. Meet @${seller.handle} at ${zone.name}`, at: trip.travels_on, handle: null, days, own: true } };
  }
  if (cross) {
    const bt = tenantById(buyer.tenant_id);
    const near = Math.min(...bt.config.safeZones.map((z) => walkMinutes(bt, buyer.housing, z.id)));
    return { minutes: near + 30, cross, zone: null, label: 'Needs a carrier', carrier: carrierInfo(l, buyer) };
  }
  const fair = pickMeetingPoint(tenantById(l.tenant_id), buyer.housing, seller.housing).best;
  return { minutes: fair.b, cross, zone: fair.name, label: `${fair.b} min walk`, carrier: null, fair };
}

export function ownTrip(userId: string, toTenant: string) {
  return db.carriers.filter((c) => c.user_id === userId && c.to_tenant === toTenant && c.travels_on > now()).sort((a, b) => a.travels_on - b.travels_on)[0] ?? null;
}

function carrierInfo(l: Listing, buyer: User) {
  const n = nextCarrier(l.tenant_id, buyer.tenant_id);
  if (!n) return { label: 'No carrier trips posted yet', at: null, handle: null };
  const days = Math.max(0, Math.round((n.at - now()) / DAY));
  const from = tenantById(l.tenant_id).short, to = tenantById(buyer.tenant_id).short;
  if (n.carrier) return { label: `Next ${from} to ${to} trip: ${slotLabel(n.at)}, from @${userById(n.carrier.user_id)?.handle}`, at: n.at, handle: userById(n.carrier.user_id)?.handle, days, tip_cents: n.carrier.tip_cents };
  return { label: `Next ${from} to ${to} shuttle: ${slotLabel(n.at)}`, at: n.at, handle: null, days };
}

/* ---------- 9.2 rank_offers(need_id) ---------- */

export function candidateFor(need: Need, l: Listing): boolean {
  if (l.kind !== need.kind) return false;
  if (need.book_id) {
    const book = db.books.find((b) => b.id === need.book_id)!;
    const sameWork = db.books.filter((b) => b.title === book.title).map((b) => b.isbn);
    const course = need.course_id ? db.courses.find((c) => c.id === need.course_id)?.code : null;
    return sameWork.includes(l.details.isbn) || l.category === `isbn:${book.isbn}` || (!!course && l.details.course === course);
  }
  return true;
}

export async function rankOffers(need: Need, buyer: User) {
  const pool = visibleListingsFor(buyer).filter(
    (l) => l.status === 'active' && l.seller_id !== buyer.id && freshness(l) !== 'hidden' && candidateFor(need, l)
      && (l.tenant_id === buyer.tenant_id || tenantById(buyer.tenant_id).config.features.crossCampus),
  );
  const ranked = await Promise.all(pool.map(async (l) => {
    const r = reachFor(buyer, l);
    const rel = reliability(l.seller_id);
    const fit = fitScore(need.requirements, l, { minutes: r.minutes, T: rel.T });
    const hardMiss = fit.rows.some((x) => x.must && x.status === 'miss' && (x.key === 'keywords' || x.key === 'event'));
    const R = reach(r.minutes);
    const score = fit.F * R * rel.T;
    return { l, r, rel, fit, R, score, hardMiss };
  }));
  const kept = ranked.filter((x) => !x.hardMiss).sort((a, b) => b.score - a.score).slice(0, 12);
  return Promise.all(kept.map(async (x) => {
    const explanation = await explainFit(x.l.id, need.id + JSON.stringify(need.requirements), x.l.title, x.fit.F, x.fit.rows);
    ensureQuestions(need, x.l, x.fit.rows);
    return {
      listing: listingCard(x.l, buyer),
      F: round(x.fit.F), R: round(x.R), T: round(x.rel.T), score: round(x.score), minutes: x.r.minutes,
      ready: x.score > 0.4 && !x.r.cross, rows: x.fit.rows, explanation, reach: x.r, reliability: x.rel,
    };
  }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Unknown must-have fields become one-tap structured questions to the seller (never chat). */
const QUESTION_TEMPLATES: Record<string, (v: any) => { prompt: string; options: string[] }> = {
  edition: (v) => ({ prompt: 'Which edition is your copy?', options: [ordinal(v), ordinal(v - 1), 'Older', 'Not sure'] }),
  highlights: () => ({ prompt: 'Any highlighting or notes inside?', options: ['None', 'Some', 'Heavy'] }),
  isbn: (v) => ({ prompt: `Does the ISBN on the back read ${v}?`, options: ['Yes', 'No'] }),
  quantity: () => ({ prompt: 'How many tickets are in this listing?', options: ['1', '2', '3', '4'] }),
  section: () => ({ prompt: 'Is the section listed on the ticket?', options: ['Yes, it is on the listing', 'General admission'] }),
};
function ensureQuestions(need: Need, l: Listing, rows: { key: string; status: string; must: boolean }[]) {
  for (const r of rows) {
    if (r.status !== 'unknown' || !r.must || !QUESTION_TEMPLATES[r.key]) continue;
    if (db.questions.some((q) => q.listing_id === l.id && q.key === r.key)) continue;
    const req = need.requirements.find((x) => x.key === r.key)!;
    const tpl = QUESTION_TEMPLATES[r.key](req.value);
    db.questions.push({ id: id('qst'), tenant_id: l.tenant_id, listing_id: l.id, need_id: need.id, asker_id: need.user_id, key: r.key, prompt: tpl.prompt, options: tpl.options, answer: null, created_at: now() });
    save();
  }
}

export function answerQuestion(qid: string, uid: string, answer: string) {
  const q = db.questions.find((x) => x.id === qid);
  const l = q && db.listings.find((x) => x.id === q.listing_id);
  if (!q || !l || l.seller_id !== uid) throw Object.assign(new Error('Question not found'), { status: 404 });
  if (!q.options.includes(answer)) throw Object.assign(new Error('Pick one of the options'), { status: 400 });
  q.answer = answer;
  const need = db.needs.find((n) => n.id === q.need_id);
  const want = need?.requirements.find((r) => r.key === q.key)?.value;
  if (q.key === 'edition') l.details.edition = answer === 'Not sure' || answer === 'Older' ? (answer === 'Older' ? 0 : l.details.edition) : parseInt(answer, 10);
  if (q.key === 'highlights') l.details.highlights = answer.toLowerCase();
  if (q.key === 'isbn') l.details.isbn = answer === 'Yes' ? want : `not-${want}`;
  if (q.key === 'quantity') l.details.quantity = parseInt(answer, 10);
  if (q.key === 'section' && answer === 'General admission') l.details.section = 'GA';
  db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id: l.lineage_id, type: 'answer', payload: { prompt: q.prompt, answer }, created_at: now() });
  if (need) {
    db.notifications.push({ id: id('ntf'), tenant_id: need.tenant_id, user_id: need.user_id, type: 'answer', title: `Seller answered: ${answer}`, body: `${q.prompt} (${l.title})`, link: `/listing/${l.id}?need=${need.id}`, read: false, created_at: now() });
  }
  save();
  return q;
}

/* ---------- Cards ---------- */

export function photosOf(l: Listing): string[] {
  if (l.photos?.length) return l.photos;
  return l.photo ? [l.photo] : [];
}

export function listingCard(l: Listing, viewer: User) {
  const r = reachFor(viewer, l);
  const fresh = freshness(l);
  return {
    id: l.id, kind: l.kind, title: l.title, category: l.category, photo: l.photo ?? null, photos: photosOf(l), ask_cents: l.ask_cents,
    condition: l.condition, condition_label: l.kind === 'item' || l.kind === 'textbook' ? CONDITION_STEPS[conditionStep(l.condition)].label : null,
    stamps: stampCount(l.lineage_id), arena_on: l.arena_on, fresh, status: l.status, visibility: l.visibility,
    campus: tenantById(l.tenant_id).short, cross: r.cross, minutes: r.minutes, reach_label: r.label, carrier: r.carrier,
    seller: publicUser(userById(l.seller_id)), details: pickDetails(l),
  };
}

function pickDetails(l: Listing) {
  const d = l.details;
  if (l.kind === 'textbook') return { edition: d.edition, isbn: d.isbn, course: d.course, highlights: d.highlights };
  if (l.kind === 'ticket') return { event: d.event, date: d.date, section: d.section, row: d.row, quantity: d.quantity, face_value_cents: d.face_value_cents };
  if (l.kind === 'service') return { course: d.course, hourly_cents: d.hourly_cents, mode: d.mode, first_discount_pct: d.first_discount_pct };
  return {};
}

/* ---------- Passport (listing detail) ---------- */

export async function passportView(l: Listing, viewer: User, needId?: string) {
  const seller = userById(l.seller_id)!;
  const events = db.passport_events.filter((e) => e.lineage_id === l.lineage_id).sort((a, b) => a.created_at - b.created_at);
  const stamps = events.filter((e) => e.type === 'stamp');
  const lastVerified = [...events].reverse().find((e) => e.type === 'verified' && e.payload.matched);
  const listedAt = [...events].reverse().find((e) => e.type === 'listed')?.created_at ?? l.created_at;
  const book = l.details.isbn ? db.books.find((b) => b.isbn === l.details.isbn) : null;
  const step = conditionStep(l.condition);

  const facts: { label: string; value: string; source: 'verified' | 'seller'; note?: string }[] = [];
  if (l.kind === 'item' || l.kind === 'textbook') {
    facts.push(lastVerified
      ? { label: 'Condition', value: `${CONDITION_STEPS[step].label}, ${l.condition}/100`, source: 'verified', note: `Matched at the last handoff (@${lastVerified.payload.by}, ${ago(lastVerified.created_at)}). Current seller re-rated it.` }
      : { label: 'Condition', value: `${CONDITION_STEPS[step].label}, ${l.condition}/100`, source: 'seller', note: CONDITION_STEPS[step].blurb });
  }
  if (l.kind === 'textbook') {
    if (book) facts.push({ label: 'Book', value: `${book.title}, ${book.edition ? ordinal(book.edition) + ' ed.' : ''}`, source: 'verified', note: `ISBN ${book.isbn} matches the campus catalog.` });
    else if (l.details.isbn) facts.push({ label: 'ISBN', value: l.details.isbn, source: 'seller' });
    if (l.details.edition != null && (!book || book.edition !== l.details.edition)) facts.push({ label: 'Edition', value: l.details.edition ? ordinal(l.details.edition) : 'Older', source: 'seller' });
    facts.push({ label: 'Notes or highlights', value: l.details.highlights ?? 'Not stated', source: 'seller' });
    if (l.details.course) facts.push({ label: 'Used for', value: l.details.course, source: 'seller' });
  }
  if (l.kind === 'ticket') {
    const d = l.details;
    facts.push({ label: 'Event', value: `${d.event}, ${fmtDate(d.date)}`, source: 'seller' });
    facts.push({ label: 'Seats', value: `${plural(d.quantity ?? 1, 'ticket')}, section ${d.section}, row ${d.row}`, source: 'seller' });
    facts.push({ label: 'Face value', value: money(d.face_value_cents), source: d.proof ? 'verified' : 'seller', note: d.proof ? 'Proof of purchase uploaded. We cannot verify the ticket itself is real; escrow and buyer confirmation cover that.' : undefined });
    facts.push({ label: 'Transfer', value: d.transfer_method ?? 'App transfer', source: 'seller' });
  }
  if (l.kind === 'service') {
    facts.push({ label: 'Teaches', value: [l.details.course, ...(l.details.skills ?? [])].filter(Boolean).join(', '), source: 'seller' });
    facts.push({ label: 'Rate', value: `${money(l.details.hourly_cents)}/hour${l.details.first_discount_pct ? `, first session ${l.details.first_discount_pct}% off` : ''}`, source: 'seller' });
    facts.push({ label: 'Where', value: l.details.mode === 'video' ? 'Campus video link' : 'Library study tables (safe zone)', source: 'seller' });
  }
  if (stamps.length) facts.push({ label: 'Handoffs', value: plural(stamps.length, 'verified handoff'), source: 'verified', note: 'Each stamp is a dual QR scan at a safe zone.' });

  const sp = l.kind === 'item' || l.kind === 'textbook' ? suggestPrice(l.tenant_id, l.category, l.condition, stamps.length) : null;

  let fit = null as any;
  const need = needId ? db.needs.find((n) => n.id === needId && n.user_id === viewer.id) : db.needs.find((n) => n.user_id === viewer.id && n.status === 'watching' && candidateFor(n, l));
  const r = reachFor(viewer, l);
  const rel = reliability(l.seller_id);
  if (need && viewer.id !== l.seller_id) {
    const f = fitScore(need.requirements, l, { minutes: r.minutes, T: rel.T });
    fit = {
      need: { id: need.id, text: need.free_text }, F: round(f.F), rows: f.rows, R: round(reach(r.minutes)), T: round(rel.T),
      score: round(f.F * reach(r.minutes) * rel.T), explanation: await explainFit(l.id, need.id + JSON.stringify(need.requirements), l.title, f.F, f.rows),
    };
    ensureQuestions(need, l, f.rows);
  }
  const questions = db.questions.filter((q) => q.listing_id === l.id).map((q) => ({ id: q.id, prompt: q.prompt, answer: q.answer, options: q.options }));
  const myTrade = db.trades.find((t) => t.listing_id === l.id && t.buyer_id === viewer.id && isActive(t));
  const sessions = l.kind === 'service' ? db.trades.filter((t) => t.listing_id === l.id && t.state === 'COMPLETE') : [];
  const ratings = db.ratings.filter((x) => sessions.some((s) => s.id === x.trade_id));

  let alternatives: any[] = [];
  if (l.kind === 'textbook' && book) alternatives = bookOptions(book.id, viewer).filter((o) => o.source !== 'campus');

  const meet = !r.cross && l.kind !== 'ticket' && !(l.kind === 'service' && l.details.mode === 'video')
    ? pickMeetingPoint(tenantById(l.tenant_id), viewer.housing, seller.housing) : null;

  return {
    listing: { ...listingCard(l, viewer), notes_for_buyer: l.notes_for_buyer ?? null, floor_set: l.floor_cents != null, last_confirmed_at: l.last_confirmed_at, created_at: l.created_at, details: l.details, is_mine: l.seller_id === viewer.id },
    seller: { ...publicUser(seller), reliability: rel, trust: trustLevel(seller.trust_credit), handoffs: trustCredit(seller.id).handoffs },
    facts,
    history: events.map((e) => ({ type: e.type, at: e.created_at, payload: e.payload })),
    price: sp && sp.S_cents != null ? { ...sp, ask_cents: l.ask_cents } : null,
    fit, reach: r, meet: meet ? { best: meet.best, options: meet.options } : null,
    questions, my_trade_id: myTrade?.id ?? null,
    tutor: l.kind === 'service' ? { sessions: sessions.length, rating: ratings.length ? Math.round((ratings.reduce((a, x) => a + x.stars, 0) / ratings.length) * 10) / 10 : null, ratings: ratings.length } : null,
    alternatives,
  };
}

const ago = (t: number) => {
  const d = Math.round((now() - t) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
};
const fmtDate = (s: string) => (s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '');

/* ---------- Course Kit ---------- */

export const SOURCE_LABELS: Record<string, string> = {
  library: 'Library copy', open_access: 'Open-access edition', ebook: 'Publisher ebook', campus: 'Used on campus',
  rental: 'Rental', used_online: 'Used online', new: 'New',
};

export function bookOptions(bookId: string, viewer: User) {
  const b = db.books.find((x) => x.id === bookId)!;
  const ten = tenantById(viewer.tenant_id);
  const opts: { source: string; label: string; cents: number; note: string; url?: string; listing_id?: string; minutes?: number; free: boolean }[] = [];
  if (b.library_url) opts.push({ source: 'library', label: SOURCE_LABELS.library, cents: 0, note: `${ten.config.library.name}, 2-hour reserve loan`, url: ten.config.library.url, free: true });
  if (b.open_access_url) opts.push({ source: 'open_access', label: SOURCE_LABELS.open_access, cents: 0, note: 'Free and legal from the publisher', url: b.open_access_url, free: true });
  const campus = db.listings
    .filter((l) => l.tenant_id === viewer.tenant_id && l.kind === 'textbook' && l.status === 'active' && l.seller_id !== viewer.id && freshness(l) !== 'hidden' && l.details.isbn === b.isbn)
    .map((l) => ({ l, r: reachFor(viewer, l) }))
    .sort((x, y) => x.l.ask_cents - y.l.ask_cents);
  if (campus[0]) {
    const c = campus[0];
    opts.push({ source: 'campus', label: SOURCE_LABELS.campus, cents: c.l.ask_cents, note: `@${userById(c.l.seller_id)?.handle}, ${c.r.minutes} min away${campus.length > 1 ? `, ${plural(campus.length - 1, 'more copy', 'more copies')}` : ''}`, listing_id: c.l.id, minutes: c.r.minutes, free: false });
  }
  if (b.prices.ebook) opts.push({ source: 'ebook', label: SOURCE_LABELS.ebook, cents: b.prices.ebook, note: '180-day access', free: false });
  if (b.prices.rental) opts.push({ source: 'rental', label: SOURCE_LABELS.rental, cents: b.prices.rental, note: 'Semester rental, typical price', free: false });
  if (b.prices.used_online) opts.push({ source: 'used_online', label: SOURCE_LABELS.used_online, cents: b.prices.used_online, note: 'Typical price incl. shipping', free: false });
  if (b.prices.new) opts.push({ source: 'new', label: SOURCE_LABELS.new, cents: b.prices.new, note: 'Campus bookstore list price', free: false });
  return opts.sort((a, c) => a.cents - c.cents);
}

export function kitView(viewer: User) {
  const courses = scoped(db.user_courses, viewer.tenant_id).filter((uc) => uc.user_id === viewer.id).map((uc) => db.courses.find((c) => c.id === uc.course_id)!);
  let sorted = 0, total = 0, cheapest = 0, count = 0, sortedCents = 0, restCents = 0;
  const out = courses.map((c) => {
    const books = db.course_books.filter((cb) => cb.course_id === c.id).map((cb) => {
      const b = db.books.find((x) => x.id === cb.book_id)!;
      const options = bookOptions(b.id, viewer);
      const choice = db.kit_choices.find((k) => k.user_id === viewer.id && k.book_id === b.id) ?? null;
      const need = db.needs.find((n) => n.user_id === viewer.id && n.book_id === b.id && n.course_id === c.id);
      const trade = need ? db.trades.find((t) => t.need_id === need.id && isActive(t)) : null;
      const bought = need ? db.trades.find((t) => t.need_id === need.id && t.state === 'COMPLETE') : null;
      const boughtListing = bought ? listingOf(bought) : null;
      const relist_listing_id = boughtListing && !db.listings.some((x) => x.lineage_id === boughtListing.lineage_id && x.seller_id === viewer.id) ? boughtListing.id : null;
      count++;
      if (choice) { sorted++; sortedCents += choice.cents; } else restCents += options[0]?.cents ?? 0;
      total = sortedCents + restCents;
      cheapest += options[0]?.cents ?? 0;
      return {
        book: { id: b.id, title: b.title, edition: b.edition, author: b.author, isbn: b.isbn }, required: cb.required, options,
        choice: choice ? { ...choice, label: SOURCE_LABELS[choice.source] } : null, need_id: need?.id ?? null, trade_id: trade?.id ?? null, relist_listing_id,
      };
    });
    return { course: c, books };
  });
  const newPrice = out.flatMap((c) => c.books).reduce((a, b) => a + (b.options.find((o) => o.source === 'new')?.cents ?? 0), 0);
  return { courses: out, sorted, count, total_cents: total, sorted_cents: sortedCents, rest_cheapest_cents: restCents, cheapest_cents: cheapest, new_cents: newPrice };
}

/* ---------- Home: "Up next" ---------- */

export async function homeView(viewer: User) {
  const cards: any[] = [];
  const myTrades = db.trades.filter((t) => t.buyer_id === viewer.id || t.seller_id === viewer.id || t.carrier_id === viewer.id);
  for (const t of myTrades.sort((a, b) => b.created_at - a.created_at)) {
    const v = describeTrade(t, viewer.id);
    const recentFail = v.failed && (t.ended_at ?? 0) > now() - 3 * DAY;
    if ((isActive(t) && v.action) || (recentFail && v.action)) {
      cards.push({ type: 'trade', trade_id: t.id, title: v.title, sentence: v.sentence, action: v.action, tone: v.tone, step: v.step, steps: v.steps, photo: listingOf(t).photo ?? null, kind: t.kind });
    }
  }
  const myListingIds = new Set(db.listings.filter((l) => l.seller_id === viewer.id).map((l) => l.id));
  for (const q of db.questions.filter((x) => myListingIds.has(x.listing_id) && !x.answer)) {
    const l = db.listings.find((x) => x.id === q.listing_id)!;
    cards.push({ type: 'question', question: { id: q.id, prompt: q.prompt, options: q.options }, title: l.title, sentence: 'A buyer\'s Fit Check needs this. One tap, no chat.', photo: l.photo ?? null, kind: l.kind });
  }
  const needs = db.needs.filter((n) => n.user_id === viewer.id && n.status !== 'closed');
  const needRows: any[] = [];
  for (const n of needs) {
    const busy = db.trades.find((t) => t.need_id === n.id && isActive(t));
    let top: any = null;
    if (n.status === 'watching' && !busy) {
      const ranked = await rankOffers(n, viewer);
      top = ranked[0] ?? null;
      if (top?.ready) cards.push({ type: 'offer', need: { id: n.id, text: n.free_text }, offer: top, title: top.listing.title, sentence: top.explanation, photo: top.listing.photo, kind: n.kind });
      needRows.push({ id: n.id, kind: n.kind, text: n.free_text, status: n.status, offers: ranked.length, ready: ranked.filter((r) => r.ready).length, top_score: top?.score ?? null, course_id: n.course_id ?? null });
    } else {
      needRows.push({ id: n.id, kind: n.kind, text: n.free_text, status: busy ? 'in_trade' : n.status, trade_id: busy?.id ?? null, offers: 0, ready: 0, top_score: null, course_id: n.course_id ?? null });
    }
  }
  const kit = kitView(viewer);
  if (kit.count && kit.sorted < kit.count) {
    cards.push({ type: 'kit', title: 'Finish your Course Kit', sentence: `${kit.sorted} of ${kit.count} sorted. Cheapest way to finish: ${money(kit.cheapest_cents)}.`, kind: 'textbook' });
  }
  const bought = myTrades.filter((t) => t.buyer_id === viewer.id && t.state === 'COMPLETE' && t.kind === 'textbook');
  for (const t of bought.slice(0, 1)) {
    const l = listingOf(t);
    const relisted = db.listings.some((x) => x.lineage_id === l.lineage_id && x.seller_id === viewer.id);
    if (!relisted) cards.push({ type: 'relist', listing_id: l.id, title: `Done with ${l.details.course ?? 'this book'}?`, sentence: `List ${l.title} in one tap. Its passport and ${plural(stampCount(l.lineage_id), 'stamp')} come with it.`, photo: l.photo ?? null, kind: 'textbook' });
  }
  const notifications = db.notifications.filter((x) => x.user_id === viewer.id).sort((a, b) => b.created_at - a.created_at).slice(0, 20);
  const trust = trustLevel(viewer.trust_credit);
  return { cards: cards.slice(0, 7), kit: { sorted: kit.sorted, count: kit.count, total_cents: kit.total_cents, sorted_cents: kit.sorted_cents, rest_cheapest_cents: kit.rest_cheapest_cents, cheapest_cents: kit.cheapest_cents }, needs: needRows, trust, notifications, unread: notifications.filter((x) => !x.read).length };
}

export function tradeSummary(t: ReturnType<typeof db.trades.find> & {}, viewer: User) {
  const l = listingOf(t);
  const v = describeTrade(t, viewer.id);
  const them = userById(t.buyer_id === viewer.id ? t.seller_id : t.buyer_id);
  return {
    id: t.id, state: t.state, kind: t.kind, role: t.buyer_id === viewer.id ? 'buyer' : t.seller_id === viewer.id ? 'seller' : 'carrier', title: l.title, photo: l.photo ?? null,
    price_cents: t.price_cents, ask_cents: l.ask_cents, counterpart: publicUser(them), step: v.step, steps: v.steps, failed: v.failed,
    action: v.action, waiting: v.waiting, sentence: v.sentence, tone: v.tone, created_at: t.created_at, ended_at: t.ended_at ?? null,
  };
}

export { suggestPrice };
