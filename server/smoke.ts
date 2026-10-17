/* End-to-end check of the trade loop against a running API: npm run smoke */
const BASE = process.env.API ?? 'http://localhost:8787';

async function call(token: string | null, method: string, path: string, body?: any) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = await r.json().catch(() => ({}));
  if (Array.isArray(j)) return Object.assign(j, { status: r.status });
  return { status: r.status, ...j };
}
const ok = (cond: any, msg: string) => {
  if (!cond) { console.error('FAIL', msg); process.exitCode = 1; } else console.log('ok  ', msg);
};

async function login(email: string) {
  const r = await call(null, 'POST', '/api/auth/demo', { email });
  return r.token as string;
}

async function main() {
  await call(null, 'POST', '/api/demo/reset');
  const bad = await call(null, 'POST', '/api/auth/start', { email: 'someone@gmail.com' });
  ok(bad.status === 400, 'non-.edu email rejected');
  const ml = await call(null, 'POST', '/api/auth/start', { email: 'newkid@crimson.ua.edu' });
  ok(ml.campus === 'UA' && ml.dev_link, 'magic link picks the UA tenant from the domain');

  const jordan = await login('jordan@crimson.ua.edu');
  const marcus = await login('marcus.t@crimson.ua.edu');
  const priya = await login('priya@uab.edu');
  await call(null, 'POST', '/api/demo/clock', { reset: true });

  const home = await call(jordan, 'GET', '/api/home');
  ok(home.cards?.length > 0, `home has ${home.cards?.length} up-next cards (first: ${home.cards?.[0]?.type})`);
  ok(home.kit?.count === 4 && home.kit?.sorted === 2, `course kit shows ${home.kit?.sorted} of ${home.kit?.count} sorted`);

  const mathNeed = home.needs.find((n: any) => n.text.startsWith('MATH 125'));
  const nd = await call(jordan, 'GET', `/api/needs/${mathNeed.id}`);
  const top = nd.offers[0];
  ok(top.listing.seller.handle === 'marcus_t', `top MATH 125 offer is @${top.listing.seller.handle} (score ${top.score}, F ${top.F}, R ${top.R}, T ${top.T})`);
  ok(nd.offers.some((o: any) => o.rows.some((r: any) => r.key === 'edition' && r.status === 'miss')), 'wrong edition copy is scored down');
  ok(nd.offers.some((o: any) => o.reach.cross), 'cross-campus copy appears with a carrier tag');

  const uabSees = await call(priya, 'GET', `/api/listings/${top.listing.id}`);
  ok(uabSees.status === 404, 'UAB cannot read a UA campus-only listing (tenant isolation)');

  const claim = await call(jordan, 'POST', `/api/listings/${top.listing.id}/claim`, { need_id: mathNeed.id });
  const tid = claim.trade_id;
  ok(tid, 'claimed: trade HELD');
  const again = await call(priya, 'POST', `/api/listings/${top.listing.id}/claim`, {});
  ok(again.status >= 400, 'second claimer is blocked while held');

  const low = await call(jordan, 'POST', `/api/trades/${tid}/event`, { event: 'offer', payload: { cents: 3700 } });
  let t = await call(jordan, 'GET', `/api/trades/${tid}`);
  ok(low.ok && t.trade.state === 'PRICED' && t.trade.price_cents === 3700, 'offer at or above floor auto-accepts');

  const asSeller = await call(marcus, 'POST', `/api/trades/${tid}/event`, { event: 'book', payload: {} });
  ok(asSeller.status === 403, 'only the buyer can book');
  ok(t.slot_options.length > 0, `slot suggestion: ${t.slot_options[0]?.label}`);
  const book = await call(jordan, 'POST', `/api/trades/${tid}/event`, { event: 'book', payload: { slot_key: t.slot_options[0].key } });
  t = await call(jordan, 'GET', `/api/trades/${tid}`);
  ok(book.ok && t.trade.state === 'BOOKED' && t.trade.pay_mode === 'reservation' && t.trade.escrow === 'none', 'booked as a reservation: pay in person, no money held');

  const early = await call(jordan, 'POST', `/api/trades/${tid}/token`);
  if (early.status === 425) {
    const mins = Math.ceil((t.slot.starts_at - t.server_now) / 60000);
    await call(jordan, 'POST', '/api/demo/clock', { minutes: mins });
  }
  const jt = await call(jordan, 'POST', `/api/trades/${tid}/token`);
  const mt = await call(marcus, 'POST', `/api/trades/${tid}/token`);
  ok(jt.token && mt.token && /^\d{6}$/.test(jt.code), 'both phones get signed 60 s tokens and 6-digit codes');
  const self = await call(jordan, 'POST', '/api/scan', { token: jt.token });
  ok(self.status === 400, 'cannot scan your own code');
  const s1 = await call(marcus, 'POST', '/api/scan', { token: jt.token });
  ok(s1.ok && !s1.complete, 'first scan recorded, not complete');
  const s2 = await call(jordan, 'POST', '/api/scan', { code: mt.code, trade_id: tid });
  ok(s2.ok && s2.complete && s2.state === 'COMPLETE', 'second scan (typed code) completes the trade');
  t = await call(jordan, 'GET', `/api/trades/${tid}`);
  ok(t.trade.escrow === 'none' && !t.trade.payment_intent, 'the scans completed it with nothing charged');
  const me = await call(jordan, 'GET', '/api/me');
  ok(me.trust.level === 2, `jordan levels up to trust ${me.trust.level} after 3 handoffs`);
  const pp = await call(jordan, 'GET', `/api/listings/${top.listing.id}`);
  ok(pp.listing.stamps === 4, `passport now has ${pp.listing.stamps} stamps`);

  // Duel
  const fridge = (await call(jordan, 'GET', '/api/listings?kind=item')).find((l: any) => l.title.startsWith('Mini fridge'));
  const c2 = await call(jordan, 'POST', `/api/listings/${fridge.id}/claim`, {});
  const duel = await call(jordan, 'POST', `/api/trades/${c2.trade_id}/duel`);
  ok(duel.range_low && duel.range_high, `duel range ${duel.range_low}-${duel.range_high}`);
  let dv = await call(jordan, 'POST', `/api/duels/${duel.id}/move`, { move: 'rock' });
  for (let i = 0; i < 10 && dv.state !== 'resolved'; i++) {
    dv = await call(jordan, 'POST', `/api/duels/${duel.id}/autoplay`);
    if (dv.state !== 'resolved' && !dv.my_move) dv = await call(jordan, 'POST', `/api/duels/${duel.id}/move`, { move: 'paper' });
  }
  ok(dv.state === 'resolved', `duel resolved, I ${dv.winner_is_me ? 'won' : 'lost'} after ${dv.round} round(s)`);
  if (dv.winner_is_me) {
    const pk = await call(jordan, 'POST', `/api/duels/${duel.id}/pick`, { cents: dv.range_low });
    ok(pk.ok, 'winner picked price at the low end');
  }

  // Test escrow stays available
  await call(jordan, 'POST', '/api/demo/payments', { mode: 'escrow' });
  const item = (await call(jordan, 'GET', '/api/listings?kind=item')).find((l: any) => l.campus === 'UA' && l.status === 'active' && !l.title.startsWith('Mini fridge'));
  const c4 = await call(jordan, 'POST', `/api/listings/${item.id}/claim`, {});
  await call(jordan, 'POST', `/api/trades/${c4.trade_id}/event`, { event: 'accept_ask' });
  let t4 = await call(jordan, 'GET', `/api/trades/${c4.trade_id}`);
  await call(jordan, 'POST', `/api/trades/${c4.trade_id}/event`, { event: 'book', payload: { slot_key: t4.slot_options[0]?.key } });
  t4 = await call(jordan, 'GET', `/api/trades/${c4.trade_id}`);
  ok(t4.trade.pay_mode === 'escrow' && t4.trade.escrow === 'authorized', 'test escrow mode: booking authorizes escrow');
  await call(jordan, 'POST', `/api/trades/${c4.trade_id}/event`, { event: 'cancel' });
  t4 = await call(jordan, 'GET', `/api/trades/${c4.trade_id}`);
  ok(t4.trade.escrow === 'cancelled', 'cancelling releases the escrow hold');
  await call(jordan, 'POST', '/api/demo/payments', { mode: 'reservation' });

  // Ticket cap
  const tix = await call(marcus, 'POST', '/api/listings', { kind: 'ticket', ask_cents: 30000, details: { event: 'Alabama vs LSU', date: '2026-11-07', face_value_cents: 20000, quantity: 2 } });
  ok(tix.status === 400 && /capped/.test(tix.error), 'ticket over face value x 1.15 rejected');

  // Chat rules
  const m1 = await call(jordan, 'POST', `/api/trades/${tid}/messages`, { body: 'see https://scam.example.com' });
  ok(m1.status === 400, 'links blocked in trade chat');
  const m2 = await call(jordan, 'POST', `/api/trades/${tid}/messages`, { body: 'Thanks, book looks great' });
  ok(m2.ok, 'plain text message allowed');

  // Hold expiry + near miss
  const lamp = (await call(jordan, 'GET', '/api/listings?kind=textbook')).find((l: any) => l.title.includes('Mankiw'));
  const ecNeed = home.needs.find((n: any) => n.text.startsWith('EC 110'));
  const c3 = await call(jordan, 'POST', `/api/listings/${lamp.id}/claim`, { need_id: ecNeed.id });
  await call(jordan, 'POST', '/api/demo/clock', { minutes: 31 });
  t = await call(jordan, 'GET', `/api/trades/${c3.trade_id}`);
  ok(t.trade.state === 'EXPIRED', 'hold expires after 30 minutes (timer job)');
  const r = await call(jordan, 'POST', `/api/trades/${c3.trade_id}/reason`, { reason: 'price' });
  const nd2 = await call(jordan, 'GET', `/api/needs/${ecNeed.id}`);
  ok(r.ok && nd2.need.requirements.some((x: any) => x.key === 'maxPriceCents'), 'near-miss "price" adds a price cap to the need');

  await call(null, 'POST', '/api/demo/clock', { reset: true });
  await call(null, 'POST', '/api/demo/reset');
  console.log(process.exitCode ? '\nSome checks failed' : '\nAll checks passed');
}

main();
