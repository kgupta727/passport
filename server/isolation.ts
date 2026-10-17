/* Tenant isolation check against a running API: npm run isolation
   A UAB student tries to read and act on UA-only data, by browsing and by guessed IDs.
   Read-only on the seed: every write attempt here is expected to be refused. */
import { pathToFileURL } from 'node:url';

export interface Check { name: string; ok: boolean; detail: string }

export async function runIsolationChecks(base = process.env.API ?? 'http://localhost:8787'): Promise<Check[]> {
  const out: Check[] = [];
  const call = async (token: string | null, method: string, path: string, body?: any) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) as any };
  };
  const login = async (email: string) => {
    const r = await call(null, 'POST', '/api/auth/demo', { email });
    if (!r.body.token) throw new Error(`Could not sign in ${email}: ${r.body.error ?? r.status}`);
    return r.body.token as string;
  };
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const refused = async (name: string, token: string, method: string, path: string, body?: any) => {
    const r = await call(token, method, path, body);
    check(name, r.status === 404, `${method} ${path} -> ${r.status}`);
  };
  const leaks = (payload: any, ids: string[]) => {
    const s = JSON.stringify(payload);
    return ids.filter((x) => s.includes(x));
  };

  const jordan = await login('jordan@crimson.ua.edu');
  const marcus = await login('marcus.t@crimson.ua.edu');
  const priya = await login('priya@uab.edu');
  const uabAdmin = await login('admin@uab.edu');

  const uaListings: any[] = (await call(jordan, 'GET', '/api/listings')).body;
  const uaOnly = uaListings.filter((l) => l.campus === 'UA' && l.visibility === 'campus').map((l) => l.id);
  const uaOpen = uaListings.find((l) => l.campus === 'UA' && l.visibility === 'open')?.id;
  const uabListings: any[] = (await call(priya, 'GET', '/api/listings')).body;
  const uabOnly = uabListings.find((l) => l.campus === 'UAB' && l.visibility === 'campus')?.id;
  const uabOpen = uabListings.find((l) => l.campus === 'UAB' && l.visibility === 'open')?.id;
  const uaNeed = (await call(jordan, 'GET', '/api/home')).body.needs?.[0]?.id;
  const uaTrade = (await call(marcus, 'GET', '/api/trades')).body.active?.[0]?.id;
  const uaCourses = ((await call(jordan, 'GET', '/api/kit')).body.courses ?? []).map((c: any) => c.id);
  if (!uaOnly.length || !uaOpen || !uabOnly || !uabOpen || !uaNeed || !uaTrade) throw new Error('Seed data missing: run a demo reset first');
  const secret = [...uaOnly, uaNeed, uaTrade];

  // Browsing
  const list = await call(priya, 'GET', '/api/listings?cross=1');
  check('UAB listing search hides UA campus-only listings', !leaks(list.body, uaOnly).length, `${list.body.length} listings, leaked ${leaks(list.body, uaOnly).length}`);
  for (const kind of ['item', 'textbook', 'ticket', 'service']) {
    const r = await call(priya, 'GET', `/api/listings?cross=1&kind=${kind}`);
    check(`UAB ${kind} search hides UA campus-only listings`, !leaks(r.body, uaOnly).length, `${r.body.length} listings`);
  }
  const home = await call(priya, 'GET', '/api/home');
  check('UAB home shows no UA listings, needs or trades', !leaks(home.body, secret).length, `leaked ${leaks(home.body, secret).join(', ') || 'nothing'}`);
  const ex = await call(priya, 'GET', '/api/explore?budget=500');
  check('UAB explore map has no UA pins', ex.status === 200 && !leaks(ex.body, secret).length && ex.body.campus === 'UAB', `${ex.body.pins?.length ?? 0} pins on ${ex.body.campus}`);
  const trades = await call(priya, 'GET', '/api/trades');
  check('UAB trade list has no UA trades', !leaks(trades.body, secret).length, 'checked active and past');
  const carriers = await call(priya, 'GET', '/api/carriers');
  check('UAB carrier board hides UA campus-only listings', !leaks(carriers.body, uaOnly).length, `${carriers.body.open_listings?.length ?? 0} cross-campus listings`);
  const kit = await call(priya, 'GET', '/api/kit');
  check('UAB course kit has no UA courses', !leaks(kit.body, uaCourses).length, `${kit.body.courses?.length ?? 0} courses`);
  const courses = await call(priya, 'GET', '/api/courses');
  check('UAB course search has no UA courses', !leaks(courses.body, uaCourses).length, `${courses.body.length ?? 0} results`);

  // Guessed IDs
  for (const id of uaOnly.slice(0, 3)) await refused(`Guessed UA listing ${id} is invisible`, priya, 'GET', `/api/listings/${id}`);
  await refused('Claiming a UA campus-only listing is refused', priya, 'POST', `/api/listings/${uaOnly[0]}/claim`, {});
  await refused('Relisting a UA listing is refused', priya, 'GET', `/api/listings/${uaOnly[0]}/relist-draft`);
  await refused('Confirming a UA listing is refused', priya, 'POST', `/api/listings/${uaOnly[0]}/confirm`, {});
  await refused('Withdrawing a UA listing is refused', priya, 'POST', `/api/listings/${uaOnly[0]}/withdraw`, {});
  await refused('Reading a UA need is refused', priya, 'GET', `/api/needs/${uaNeed}`);
  await refused('Editing a UA need is refused', priya, 'PATCH', `/api/needs/${uaNeed}`, { requirements: [] });
  await refused('Closing a UA need is refused', priya, 'DELETE', `/api/needs/${uaNeed}`);
  await refused('Reading a UA trade is refused', priya, 'GET', `/api/trades/${uaTrade}`);
  await refused('Reading UA trade messages is refused', priya, 'GET', `/api/trades/${uaTrade}/messages`);
  await refused('Posting into a UA trade chat is refused', priya, 'POST', `/api/trades/${uaTrade}/messages`, { body: 'hi' });
  await refused('Advancing a UA trade is refused', priya, 'POST', `/api/trades/${uaTrade}/event`, { event: 'cancel' });
  await refused('Getting a UA scan code is refused', priya, 'POST', `/api/trades/${uaTrade}/token`, {});
  await refused('Typing a code for a UA trade is refused', priya, 'POST', '/api/scan', { trade_id: uaTrade, code: '000000' });
  await refused('Starting a duel on a UA trade is refused', priya, 'POST', `/api/trades/${uaTrade}/duel`, {});
  const fake = await call(priya, 'GET', '/api/trades/trd_doesnotexist');
  const real = await call(priya, 'GET', `/api/trades/${uaTrade}`);
  check('A real UA trade and a made-up ID look identical', fake.status === real.status && fake.body.error === real.body.error, `${fake.status} "${fake.body.error}" vs ${real.status} "${real.body.error}"`);

  // Tokens
  const [jBody] = jordan.split('.');
  const [, pSig] = priya.split('.');
  const forged = await call(`${jBody}.${pSig}`, 'GET', '/api/me');
  check('A token with a swapped identity is rejected', forged.status === 401, `-> ${forged.status}`);
  const tampered = await call(priya.slice(0, -2) + (priya.endsWith('AA') ? 'BB' : 'AA'), 'GET', '/api/me');
  check('A tampered token is rejected', tampered.status === 401, `-> ${tampered.status}`);

  // Cross-campus visibility, both directions
  const a = await call(priya, 'GET', `/api/listings/${uaOpen}`);
  check('UAB sees a UA listing marked visible to other campuses', a.status === 200, `GET ${uaOpen} -> ${a.status}`);
  const b = await call(jordan, 'GET', `/api/listings/${uabOpen}`);
  check('UA sees a UAB listing marked visible to other campuses', b.status === 200, `GET ${uabOpen} -> ${b.status}`);
  await refused('UA cannot see a UAB campus-only listing', jordan, 'GET', `/api/listings/${uabOnly}`);
  const bList = await call(jordan, 'GET', '/api/listings?cross=1');
  check('UA search hides UAB campus-only listings', !leaks(bList.body, [uabOnly]).length, `${bList.body.length} listings`);

  // Per-campus admin
  const disputes = await call(uabAdmin, 'GET', '/api/admin/disputes');
  check('UAB admin dispute queue has no UA trades', disputes.status === 200 && !leaks(disputes.body, secret).length, `${disputes.body.length ?? 0} disputes`);
  await refused('UAB admin cannot open a UA trade', uabAdmin, 'GET', `/api/trades/${uaTrade}`);
  await refused('UAB admin cannot resolve a UA trade', uabAdmin, 'POST', `/api/admin/disputes/${uaTrade}/resolve`, { decision: 'refund' });

  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runIsolationChecks().then((checks) => {
    for (const c of checks) console.log(c.ok ? 'ok  ' : 'FAIL', c.name, `(${c.detail})`);
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n${checks.length - failed} of ${checks.length} isolation checks passed`);
    if (failed) process.exitCode = 1;
  }).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
