import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB, emptyDB, id, Listing, Tenant, User, Kind, Requirement, DAY, HOUR, MIN, Trade, Book } from './db.js';
import { installCourses, readCoursesCsv, demoAdminFor } from './campus.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Small deterministic PRNG so the seed looks the same every reset. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function loadTenantFiles(): Tenant[] {
  const dir = path.join(here, 'tenants');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { id: `ten_${j.slug}`, slug: j.slug, name: j.name, short: j.short, domains: j.domains, config: j.config };
  });
}

const BOOKS: (Omit<Book, 'id'> & { key: string })[] = [
  { key: 'stewart9', isbn: '9781337613927', title: 'Calculus: Early Transcendentals', edition: 9, author: 'James Stewart', library_url: 'reserve', prices: { ebook: 8999, rental: 4499, used_online: 6800, new: 23500 } },
  { key: 'stewart8', isbn: '9781285741550', title: 'Calculus: Early Transcendentals', edition: 8, author: 'James Stewart', prices: { used_online: 2900, new: 19900 } },
  { key: 'chem2e', isbn: '9781947172616', title: 'Chemistry 2e (OpenStax)', edition: 2, author: 'Flowers et al.', open_access_url: 'https://openstax.org/details/books/chemistry-2e', library_url: 'reserve', prices: { new: 5200 } },
  { key: 'psych2e', isbn: '9781951693237', title: 'Psychology 2e (OpenStax)', edition: 2, author: 'Spielman et al.', open_access_url: 'https://openstax.org/details/books/psychology-2e', prices: { new: 4600 } },
  { key: 'mankiw9', isbn: '9780357133484', title: 'Principles of Microeconomics', edition: 9, author: 'N. Gregory Mankiw', library_url: 'reserve', prices: { ebook: 6499, rental: 3999, used_online: 5500, new: 21000 } },
  { key: 'campbell12', isbn: '9780135188743', title: 'Campbell Biology', edition: 12, author: 'Urry et al.', library_url: 'reserve', prices: { ebook: 7999, rental: 5299, used_online: 8900, new: 26000 } },
  { key: 'theysay5', isbn: '9780393538700', title: 'They Say / I Say', edition: 5, author: 'Graff and Birkenstein', library_url: 'reserve', prices: { ebook: 2400, rental: 1500, used_online: 1800, new: 3500 } },
  { key: 'moore9', isbn: '9781319244378', title: 'The Basic Practice of Statistics', edition: 9, author: 'Moore, Notz and Fligner', prices: { ebook: 6999, rental: 3800, used_online: 4900, new: 18900 } },
  { key: 'zelle3', isbn: '9781590282755', title: 'Python Programming: An Introduction to CS', edition: 3, author: 'John Zelle', prices: { ebook: 4400, used_online: 3500, new: 5500 } },
];

const COURSES: Record<string, [string, string, string[]][]> = {
  ua: [
    ['MATH 125', 'Calculus I', ['stewart9']], ['CH 101', 'General Chemistry', ['chem2e']], ['EC 110', 'Principles of Microeconomics', ['mankiw9']],
    ['BSC 114', 'Principles of Biology I', ['campbell12']], ['PY 101', 'Introduction to Psychology', ['psych2e']], ['EN 101', 'English Composition I', ['theysay5']],
    ['ST 260', 'Statistical Data Analysis', ['moore9']], ['CS 100', 'CS I: Python', ['zelle3']], ['MATH 126', 'Calculus II', ['stewart9']],
  ],
  uab: [
    ['MA 125', 'Calculus I', ['stewart9']], ['CH 115', 'General Chemistry I', ['chem2e']], ['PY 101', 'Introduction to Psychology', ['psych2e']],
    ['EC 211', 'Principles of Microeconomics', ['mankiw9']], ['BY 123', 'Introductory Biology I', ['campbell12']], ['EH 101', 'English Composition', ['theysay5']],
  ],
  auburn: [
    ['MATH 1610', 'Calculus I', ['stewart9']], ['CHEM 1030', 'Fundamentals of Chemistry I', ['chem2e']], ['ECON 2020', 'Principles of Microeconomics', ['mankiw9']],
    ['BIOL 1020', 'Principles of Biology', ['campbell12']], ['PSYC 2010', 'Introduction to Psychology', ['psych2e']], ['ENGL 1100', 'English Composition I', ['theysay5']],
  ],
};

type UserSeed = [handle: string, name: string, housing: string, extra?: Partial<User>];
const USERS: Record<string, { domain: string; users: UserSeed[] }> = {
  ua: {
    domain: 'crimson.ua.edu',
    users: [
      ['jordan', 'Jordan Lee', 'tutwiler', { demo: true }], ['marcus_t', 'Marcus Thompson', 'strip', { demo: true }],
      ['ravi', 'Ravi Patel', 'strip', { demo: true }], ['maya_k', 'Maya Kim', 'presidential', { demo: true }],
      ['deshawn', 'DeShawn Carter', 'riverside'], ['ellie_b', 'Ellie Brooks', 'strip'], ['sam_o', 'Sam Ortiz', 'presidential'],
      ['ua_admin', 'UA Student Affairs', 'riverside', { is_admin: true, demo: true, email: 'admin@ua.edu' }],
      ['kim_s', 'Kim Sato', 'presidential'], ['alex_r', 'Alex Rivera', 'ridgecrest'], ['tori_m', 'Tori Mills', 'riverside'],
      ['ben_h', 'Ben Hughes', 'presidential'], ['zoe_p', 'Zoe Park', 'presidential'], ['omar_a', 'Omar Ali', 'tutwiler'], ['lena_w', 'Lena Wu', 'ridgecrest'],
    ],
  },
  uab: {
    domain: 'uab.edu',
    users: [
      ['priya', 'Priya Shah', 'blazer', { demo: true }], ['tyler_w', 'Tyler Webb', 'camp', { demo: true }], ['nina_r', 'Nina Reyes', 'rast'],
      ['uab_admin', 'UAB Student Life', 'rast', { is_admin: true, demo: true, email: 'admin@uab.edu' }],
      ['chris_d', 'Chris Dunn', 'blazer'], ['ana_g', 'Ana Gomez', 'southside'], ['jay_k', 'Jay Kumar', 'camp'], ['mia_t', 'Mia Torres', 'rast'],
    ],
  },
  auburn: {
    domain: 'auburn.edu',
    users: [
      ['cole', 'Cole Anderson', 'quad', { demo: true }], ['hannah_j', 'Hannah Jones', 'village', { demo: true }], ['luis_m', 'Luis Martinez', 'hill'],
      ['auburn_admin', 'Auburn Student Affairs', 'quad', { is_admin: true, demo: true, email: 'admin@auburn.edu' }],
      ['grace_l', 'Grace Lin', 'downtown'], ['noah_b', 'Noah Bell', 'hill'], ['ella_c', 'Ella Cruz', 'village'], ['max_f', 'Max Ford', 'quad'],
    ],
  },
};

const BASE_SALES: Record<string, number> = {
  Appliances: 5600, Electronics: 7800, Furniture: 4400, 'Dorm and decor': 1600, Bikes: 17500, Clothing: 2200, Other: 1500,
  'isbn:9781337613927': 4000, 'isbn:9781285741550': 2200, 'isbn:9780357133484': 3600, 'isbn:9780135188743': 6800,
  'isbn:9780393538700': 1300, 'isbn:9781319244378': 3800, 'isbn:9781590282755': 2600, textbook: 3000,
};

/** Regional reference sales so price suggestions work on day one. */
export function baselineSales(db: DB, t: Tenant, T0: number, rand: () => number = Math.random) {
  for (const [cat, cents] of Object.entries(BASE_SALES)) {
    for (let i = 0; i < 12; i++) {
      db.sales.push({ id: id('sal'), tenant_id: t.id, category: cat, cents: Math.round(cents * (0.82 + rand() * 0.36)), at: T0 - (10 + i * 9) * DAY });
    }
  }
}

const EXTRA_STUDENTS: [string, string][] = [['Avery', 'Brooks'], ['Jamie', 'Cole'], ['Riley', 'Nguyen']];
const STARTER: [string, string, Kind, string, number, number][] = [
  ['Mini fridge, 3.2 cu ft', 'Appliances', 'item', 'fridge', 72, 5200], ['LED table lamp', 'Dorm and decor', 'item', 'lamp-2', 85, 1800],
  ['Mesh desk chair', 'Furniture', 'item', 'office-chair', 80, 4000], ['24 in. monitor', 'Electronics', 'item', 'monitor', 88, 7000],
  ['Microwave, 700W', 'Appliances', 'item', 'microwave', 75, 3500], ['Calculus: Early Transcendentals 9e', 'isbn:9781337613927', 'textbook', 'calculus-desk', 80, 3800],
  ['Yellow rain jacket, M', 'Clothing', 'item', 'rain-jacket', 90, 2600], ['Mechanical keyboard', 'Electronics', 'item', 'keyboard', 85, 5500],
  ['Twin XL mattress topper', 'Dorm and decor', 'item', 'topper', 82, 2200], ['Hybrid bike, medium', 'Bikes', 'item', 'bike-2', 74, 14000],
];

/** UA category medians (cents) for the demo. Rarity and suggested prices read these. */
const UA_MEDIANS: Record<string, number> = {
  Appliances: 6000, Electronics: 8000, Furniture: 5000, 'Dorm and decor': 2400, Bikes: 18000, Clothing: 2500, Other: 2000, textbook: 3000,
  'isbn:9781337613927': 4200, 'isbn:9781285741550': 2200, 'isbn:9780357133484': 3600, 'isbn:9780135188743': 7000,
  'isbn:9780393538700': 1300, 'isbn:9781319244378': 3800, 'isbn:9781590282755': 2600,
};
/** Resale price by month relative to October (Jan..Dec): move-in months run high, move-out months run low. */
const SEASON = [1.08, 1.0, 0.97, 0.9, 0.72, 0.8, 0.92, 1.22, 1.1, 1.0, 0.95, 0.84];
/** Newest first. The ten newest straddle 1.0 so the median of the last ten sales is exactly the target. */
const SALE_SPREAD = [1.04, 0.92, 1.0, 1.12, 0.88, 1.0, 0.96, 1.18, 0.82, 1.08, 0.9, 1.1];

/** Usual free blocks: weekdays 9 to 21, weekends 11 to 20. */
const allWindows = () => {
  const w: { weekday: number; hour: number }[] = [];
  for (let d = 0; d < 7; d++) {
    const [a, b] = d === 0 || d === 6 ? [11, 20] : [9, 21];
    for (let h = a; h <= b; h++) w.push({ weekday: d, hour: h });
  }
  return w;
};

export function seed(): DB {
  const db = emptyDB();
  const T0 = Date.now();
  const rand = rng(42);
  const pick = <X,>(xs: X[]) => xs[Math.floor(rand() * xs.length)];

  db.tenants = loadTenantFiles();
  for (const t of db.tenants) for (const d of t.domains) db.tenant_domains.push({ domain: d, tenant_id: t.id });

  const bookId: Record<string, string> = {};
  for (const b of BOOKS) {
    const { key, ...rest } = b;
    const bid = `bk_${key}`;
    bookId[key] = bid;
    db.books.push({ id: bid, ...rest });
  }
  for (const t of db.tenants) {
    if (!COURSES[t.slug]) {
      installCourses(db, t, readCoursesCsv(t.slug) ?? []);
      if (!USERS[t.slug]) db.users.push(demoAdminFor(t, T0 - 200 * DAY));
      continue;
    }
    for (const [code, title, books] of COURSES[t.slug]) {
      const cid = `crs_${t.slug}_${code.replace(/\s/g, '').toLowerCase()}`;
      db.courses.push({ id: cid, tenant_id: t.id, code, title });
      for (const k of books) db.course_books.push({ course_id: cid, book_id: bookId[k], required: true });
    }
  }

  const U: Record<string, User> = {};
  for (const t of db.tenants) {
    const spec = USERS[t.slug];
    if (!spec) continue;
    for (const [handle, name, housing, extra] of spec.users) {
      const u: User = {
        id: `usr_${handle}`, tenant_id: t.id, email: extra?.email ?? `${handle.replace(/_/g, '.')}@${spec.domain}`, handle, name, housing,
        trust_credit: 0, created_at: T0 - 200 * DAY, ...extra,
      };
      db.users.push(u);
      U[handle] = u;
    }
  }
  const ten = (slug: string) => db.tenants.find((t) => t.slug === slug)!;

  /* Campuses added by config file alone get three students (one demo login) and a small starter marketplace below. */
  const extraCampuses = db.tenants.filter((t) => !USERS[t.slug]);
  for (const t of extraCampuses) {
    EXTRA_STUDENTS.forEach(([first, last], i) => {
      const handle = `${first.toLowerCase()}_${t.slug}`;
      const u: User = { id: `usr_${handle}`, tenant_id: t.id, email: `${first.toLowerCase()}.${last.toLowerCase()}@${t.domains[0]}`, handle, name: `${first} ${last}`, housing: t.config.housing[i % t.config.housing.length].id, trust_credit: 0, created_at: T0 - 120 * DAY, demo: i === 0 };
      db.users.push(u);
      U[handle] = u;
    });
  }

  for (const t of db.tenants) baselineSales(db, t, T0, rand);

  const passport = (l: Listing, type: any, payload: any, at: number) =>
    db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id: l.lineage_id, type, payload, created_at: at });

  interface LSeed {
    seller: string; kind: Kind; title: string; category: string; details?: Record<string, any>; condition?: number; ask: number; floor?: number | null;
    suggested?: number | null; arena?: boolean; open?: boolean; ageDays?: number; confirmedDaysAgo?: number; photo?: string; photos?: string[]; notes?: string;
    lineage?: { from: string; to: string; daysAgo: number; cents: number; where: string }[]; priceHistory?: number[]; verified?: boolean; key?: string;
  }
  const L: Record<string, Listing> = {};
  const mk = (s: LSeed) => {
    const seller = U[s.seller];
    const lineage_id = id('lin');
    const created = T0 - (s.ageDays ?? 3) * DAY;
    const l: Listing = {
      id: id('lst'), tenant_id: seller.tenant_id, seller_id: seller.id, kind: s.kind, title: s.title, category: s.category, details: s.details ?? {},
      condition: s.condition ?? 0, ask_cents: s.ask, floor_cents: s.floor ?? null, suggested_cents: s.suggested ?? null, arena_on: !!s.arena,
      visibility: s.open ? 'open' : 'campus', photo: s.photos?.[0] ?? s.photo, photos: s.photos, notes_for_buyer: s.notes, lineage_id, free_windows: allWindows(),
      last_confirmed_at: T0 - (s.confirmedDaysAgo ?? Math.min(s.ageDays ?? 3, 5)) * DAY, status: 'active', created_at: created,
    };
    db.listings.push(l);
    for (const h of s.lineage ?? []) {
      passport(l, 'stamp', { from: h.from, to: h.to, cents: h.cents, where: h.where, method: 'dual scan' }, T0 - h.daysAgo * DAY);
      passport(l, 'verified', { by: h.to, matched: true, condition: s.condition }, T0 - h.daysAgo * DAY + HOUR);
    }
    passport(l, 'listed', { by: seller.handle, cents: (s.priceHistory ?? [s.ask])[0], condition: s.condition }, created);
    (s.priceHistory ?? []).slice(1).forEach((c, i, arr) => passport(l, 'price', { cents: c }, created + ((i + 1) * (T0 - created)) / (arr.length + 1)));
    if (s.key) L[s.key] = l;
    return l;
  };

  /* ---------- UA ---------- */
  const isbnDetails = (k: string, extra: Record<string, any>) => {
    const b = BOOKS.find((x) => x.key === k)!;
    return { isbn: b.isbn, edition: b.edition, author: b.author, ...extra };
  };
  /*
   * UA demo marketplace. Pins sit at the seller's nearest safe zone, so housing decides the map:
   * Presidential -> Rec Center (Maya's start), Tutwiler/Ridgecrest -> UAPD, Strip -> Gorgas, Riverside -> Ferguson.
   * Eight Explore finds sit within 25 walking minutes of the Rec Center; everything else is at Gorgas or Ferguson.
   * Rarity is computed (rarity.ts). Rare and up are the only copy of their model on campus and 30-50% under the
   * category median; everything else has at least one twin on campus and is priced near its suggested price.
   */
  const ph = (f: string) => `/seed/photos/${f}.jpg`;

  // Near the Rec Center and UAPD: the eight Explore finds.
  mk({ // Legendary: only calculator on campus, 42% under the Electronics median ($80)
    key: 'ti84_alex', seller: 'alex_r', kind: 'item', title: 'TI-84 Plus CE graphing calculator', category: 'Electronics',
    details: { brand: 'Texas Instruments', color: 'Blue', includes: 'Charging cable, slide cover' }, condition: 90, ask: 4600, ageDays: 2, photos: [ph('calculator-2'), ph('calculator')],
    notes: 'Switched majors, no more math. Works perfectly.',
  });
  mk({ // Epic: only fridge, Worn, 43% under the Appliances median ($60)
    key: 'fridge_omar', seller: 'omar_a', kind: 'item', title: 'Mini fridge, 3.1 cu ft (Frigidaire)', category: 'Appliances',
    details: { brand: 'Frigidaire', size: '3.1 cu ft', color: 'Black' }, condition: 68, ask: 3400, floor: 3000, arena: true, ageDays: 4, photos: [ph('fridge')],
    priceHistory: [4200, 3800, 3400], notes: 'Scuff on the door, cools fine.',
  });
  mk({ // Epic: only futon, Worn, 44% under the Furniture median ($50)
    key: 'futon_zoe', seller: 'zoe_p', kind: 'item', title: 'Blue futon couch, folds flat', category: 'Furniture',
    details: { size: 'Full' }, condition: 60, ask: 2800, floor: 2500, ageDays: 3, photos: [ph('futon')], notes: 'You carry it, I will help you load it.',
  });
  mk({ // Rare: only Campbell on campus, Worn, 31% under its median ($70)
    key: 'campbell_kim', seller: 'kim_s', kind: 'textbook', title: 'Campbell Biology, 12th ed.', category: 'isbn:9780135188743',
    details: isbnDetails('campbell12', { course: 'BSC 114', highlights: 'some' }), condition: 66, ask: 4800, ageDays: 5, photos: [ph('biology')],
  });
  mk({ // Rare: only microwave, Worn, 32% under the Appliances median ($60)
    key: 'micro_ben', seller: 'ben_h', kind: 'item', title: 'Microwave, 700W', category: 'Appliances',
    details: { brand: 'Hamilton Beach' }, condition: 62, ask: 4100, ageDays: 3, photos: [ph('microwave')],
  });
  mk({ // Uncommon: one other chair on campus
    key: 'chair_ben', seller: 'ben_h', kind: 'item', title: 'Gray accent chair with cushion', category: 'Furniture',
    details: { color: 'Gray' }, condition: 84, ask: 4800, ageDays: 2, photos: [ph('chair')],
  });
  mk({ // Uncommon: Maya's topper is the other one
    key: 'topper_zoe', seller: 'zoe_p', kind: 'item', title: 'Twin XL mattress topper, 2 in.', category: 'Dorm and decor',
    details: { size: 'Twin XL' }, condition: 86, ask: 2200, ageDays: 1, photos: [ph('topper-2')],
  });
  mk({ // Common: two other lamps on campus. Sam lives in Presidential too: 6 minutes to the Rec Center.
    key: 'lamp_sam', seller: 'sam_o', kind: 'item', title: 'Desk lamp, dimmable', category: 'Dorm and decor',
    details: { brand: 'TaoTronics', color: 'Black', includes: 'USB charging port' }, condition: 88, ask: 2400, ageDays: 2, photos: [ph('lamp')],
    notes: 'Three brightness levels. Bulb included.',
  });
  mk({
    key: 'topper_maya', seller: 'maya_k', kind: 'item', title: 'Twin XL mattress topper (memory foam)', category: 'Dorm and decor',
    details: { size: 'Twin XL' }, condition: 85, ask: 2400, ageDays: 2, photos: [ph('topper')],
  });

  // Gorgas (The Strip) and Ferguson (Riverside): out of Explore range from the Rec Center.
  mk({
    key: 'stewart_marcus', seller: 'marcus_t', kind: 'textbook', title: 'Calculus: Early Transcendentals, 9th ed.', category: 'isbn:9781337613927',
    details: isbnDetails('stewart9', { course: 'MATH 125', highlights: 'none', format: 'Hardcover' }), condition: 88, ask: 4200, floor: 3600, suggested: 4600, arena: true,
    priceHistory: [4800, 4500, 4200], ageDays: 9, confirmedDaysAgo: 1, photos: [ph('calculus-stack'), ph('calculus-notes')], notes: 'Name written inside the cover, otherwise clean.',
    lineage: [
      { from: 'lena_w', to: 'alex_r', daysAgo: 720, cents: 9500, where: 'Gorgas Library steps' },
      { from: 'alex_r', to: 'kim_s', daysAgo: 400, cents: 6200, where: 'Ferguson Student Center' },
      { from: 'kim_s', to: 'marcus_t', daysAgo: 60, cents: 4400, where: 'UAPD lobby' },
    ],
  });
  mk({
    key: 'stewart_ellie', seller: 'ellie_b', kind: 'textbook', title: 'Stewart Calculus 9e (MATH 125)', category: 'isbn:9781337613927',
    details: isbnDetails('stewart9', { course: 'MATH 125', highlights: 'none', format: 'Loose-leaf' }), condition: 92, ask: 3900, floor: null, suggested: 4000, ageDays: 2, photos: [ph('calculus-open')],
  });
  mk({
    key: 'stewart_deshawn', seller: 'deshawn', kind: 'textbook', title: 'Calc textbook for MATH 125/126', category: 'isbn:9781337613927',
    details: { isbn: '9781337613927', course: 'MATH 125' }, condition: 70, ask: 3000, suggested: 2800, ageDays: 4, photos: [ph('calculus-tower')],
  });
  mk({
    key: 'mankiw_ravi', seller: 'ravi', kind: 'textbook', title: 'Mankiw, Principles of Microeconomics 9e', category: 'isbn:9780357133484',
    details: isbnDetails('mankiw9', { course: 'EC 110', highlights: 'some' }), condition: 66, ask: 2600, floor: 2200, suggested: 2520, arena: true, ageDays: 5, photos: [ph('econ')],
    lineage: [{ from: 'zoe_p', to: 'ravi', daysAgo: 130, cents: 4000, where: 'Ferguson Student Center' }],
  });
  mk({
    key: 'mankiw_tori', seller: 'tori_m', kind: 'textbook', title: 'Principles of Microeconomics (Mankiw), 9th', category: 'isbn:9780357133484',
    details: isbnDetails('mankiw9', { course: 'EC 110', highlights: 'none' }), condition: 88, ask: 3400, ageDays: 3, photos: [ph('econ-2')],
  });
  mk({
    key: 'theysay_ellie', seller: 'ellie_b', kind: 'textbook', title: 'They Say / I Say, 5th ed.', category: 'isbn:9780393538700',
    details: isbnDetails('theysay5', { course: 'EN 101', highlights: 'some' }), condition: 70, ask: 1000, suggested: 910, ageDays: 3, photos: [ph('writing')],
  });
  mk({
    key: 'theysay_deshawn', seller: 'deshawn', kind: 'textbook', title: 'They Say I Say (EN 101)', category: 'isbn:9780393538700',
    details: isbnDetails('theysay5', { course: 'EN 101', highlights: 'none' }), condition: 82, ask: 1200, ageDays: 6, photos: [ph('writing-2')],
  });
  mk({
    key: 'lamp_ellie', seller: 'ellie_b', kind: 'item', title: 'Table lamp, white shade', category: 'Dorm and decor',
    details: { brand: 'IKEA' }, condition: 70, ask: 1600, ageDays: 9, confirmedDaysAgo: 2, photos: [ph('lamp-2')],
  });
  mk({
    key: 'lamp_tori', seller: 'tori_m', kind: 'item', title: 'Floor lamp, black, adjustable head', category: 'Dorm and decor',
    details: { color: 'Black' }, condition: 84, ask: 2600, ageDays: 4, photos: [ph('lamp-floor')],
  });
  mk({
    key: 'chair_deshawn', seller: 'deshawn', kind: 'item', title: 'Upholstered lounge chair', category: 'Furniture',
    details: { color: 'Green' }, condition: 84, ask: 4500, ageDays: 5, photos: [ph('office-chair')],
  });
  mk({
    key: 'keyboard_marcus', seller: 'marcus_t', kind: 'item', title: 'Mechanical keyboard, RGB backlit', category: 'Electronics',
    details: { includes: 'USB-C cable, keycap puller' }, condition: 90, ask: 7200, ageDays: 3, photos: [ph('keyboard')],
  });
  mk({
    key: 'speaker_tori', seller: 'tori_m', kind: 'item', title: 'Beats Pill+ Bluetooth speaker', category: 'Electronics',
    details: { brand: 'Beats', color: 'Black' }, condition: 72, ask: 5200, ageDays: 6, photos: [ph('speaker')],
  });
  mk({
    key: 'monitor_ellie', seller: 'ellie_b', kind: 'item', title: '24 in. monitor, 1080p', category: 'Electronics',
    details: { brand: 'Dell', includes: 'HDMI cable' }, condition: 86, ask: 7500, ageDays: 4, photos: [ph('monitor')],
  });
  mk({
    key: 'tv_deshawn', seller: 'deshawn', kind: 'item', title: '32 in. TV (TCL Roku)', category: 'Electronics',
    details: { brand: 'TCL', includes: 'Remote, wall mount' }, condition: 80, ask: 8500, ageDays: 7, photos: [ph('tv')],
  });
  mk({
    key: 'desk_ravi', seller: 'ravi', kind: 'item', title: 'Small wooden writing desk', category: 'Furniture',
    details: {}, condition: 70, ask: 3500, ageDays: 6, photos: [ph('desk')],
  });
  mk({
    key: 'laptopdesk_tori', seller: 'tori_m', kind: 'item', title: 'Laptop desk, adjustable height', category: 'Dorm and decor',
    details: {}, condition: 85, ask: 2200, ageDays: 2, photos: [ph('laptop-desk')],
  });
  mk({
    key: 'siphon_marcus', seller: 'marcus_t', kind: 'item', title: 'Siphon coffee brewer (Hario)', category: 'Appliances',
    details: { brand: 'Hario' }, condition: 88, ask: 5200, ageDays: 5, photos: [ph('coffee-maker')],
  });
  mk({
    key: 'coffee_deshawn', seller: 'deshawn', kind: 'item', title: 'Ninja coffee maker, 12-cup', category: 'Appliances',
    details: { brand: 'Ninja' }, condition: 84, ask: 5200, ageDays: 3, photos: [ph('coffee-maker-2')],
  });
  mk({
    key: 'rug_deshawn', seller: 'deshawn', kind: 'item', title: 'Area rug, 5 x 7, blue', category: 'Dorm and decor',
    details: { size: '5 x 7 ft' }, condition: 82, ask: 3000, ageDays: 8, photos: [ph('rug')],
  });
  mk({
    key: 'clock_ravi', seller: 'ravi', kind: 'item', title: 'Twin-bell alarm clock', category: 'Dorm and decor',
    details: {}, condition: 90, ask: 2200, ageDays: 2, photos: [ph('alarm-clock')],
  });
  mk({
    key: 'jacket_tori', seller: 'tori_m', kind: 'item', title: 'Yellow rain jacket, size M', category: 'Clothing',
    details: { size: 'M' }, condition: 88, ask: 3000, ageDays: 4, photos: [ph('rain-jacket')],
  });
  mk({
    key: 'hoodie_marcus', seller: 'marcus_t', kind: 'item', title: 'Black hoodie, size L', category: 'Clothing',
    details: { size: 'L' }, condition: 84, ask: 2400, ageDays: 5, photos: [ph('sweatshirt')],
  });
  mk({
    key: 'yoga_ellie', seller: 'ellie_b', kind: 'item', title: 'Teal yoga mat, 6 mm', category: 'Other',
    details: {}, condition: 82, ask: 1800, ageDays: 3, photos: [ph('yoga-mat')],
  });
  mk({
    key: 'racket_deshawn', seller: 'deshawn', kind: 'item', title: 'Tennis racket with balls', category: 'Other',
    details: {}, condition: 70, ask: 1800, ageDays: 6, photos: [ph('tennis-racket')],
  });
  mk({
    key: 'bike_deshawn', seller: 'deshawn', kind: 'item', title: 'Trek FX 2 hybrid bike, medium', category: 'Bikes',
    details: { brand: 'Trek', size: 'M', includes: 'U-lock' }, condition: 82, ask: 16500, floor: 15000, arena: true, open: true, ageDays: 8, notes: 'Moving off campus Friday.', photos: [ph('bike')],
  });
  mk({
    key: 'bike_ravi', seller: 'ravi', kind: 'item', title: 'Single-speed city bike', category: 'Bikes',
    details: { size: 'L' }, condition: 70, ask: 12000, ageDays: 5, photos: [ph('bike-2')],
  });
  mk({ // Held by @tori_m below, so not on the map while the hold runs.
    key: 'headphones_marcus', seller: 'marcus_t', kind: 'item', title: 'Over-ear headphones, wireless', category: 'Electronics',
    details: { includes: 'Case, aux cable' }, condition: 90, ask: 8500, floor: 7600, suggested: 8000, arena: true, ageDays: 3, photos: [ph('headphones')],
  });
  const gameDay = nextDow(T0, 6, 14);
  mk({
    key: 'uga_tix', seller: 'deshawn', kind: 'ticket', title: '2 tickets: Alabama vs Georgia', category: 'Tickets',
    details: { event: 'Alabama vs Georgia', venue: 'Bryant-Denny Stadium', date: isoDate(gameDay), section: 'S-12', row: '22', quantity: 2, face_value_cents: 18000, transfer_method: 'App transfer (Ticketmaster)', proof: true },
    ask: 20000, floor: 19000, ageDays: 3, photo: '/seed/ticket.svg',
  });
  mk({
    key: 'bball_tix', seller: 'sam_o', kind: 'ticket', title: 'Coleman Coliseum: Alabama vs Auburn (1 ticket)', category: 'Tickets',
    details: { event: 'Alabama vs Auburn basketball', venue: 'Coleman Coliseum', date: isoDate(T0 + 12 * DAY), section: '104', row: 'K', quantity: 1, face_value_cents: 2500, transfer_method: 'QR screenshot', proof: true },
    ask: 2800, ageDays: 1, photo: '/seed/ticket.svg',
  });
  const calcAvail = [2, 4].flatMap((d) => [15, 16, 17].map((h) => ({ weekday: d, hour: h }))).concat([0, 6].flatMap((d) => [13, 14, 15, 16].map((h) => ({ weekday: d, hour: h }))));
  mk({
    key: 'tutor_maya', seller: 'maya_k', kind: 'service', title: 'Calc I tutoring (MATH 125)', category: 'Tutoring',
    details: { course: 'MATH 125', skills: ['Limits', 'Derivatives', 'Exam prep'], hourly_cents: 2500, first_discount_pct: 20, availability: calcAvail, mode: 'in_person', bio: 'Math major, got an A in MATH 125 and 126. Patient with exam panic.' },
    ask: 2500, ageDays: 40, photo: '/seed/tutor.svg',
  });
  mk({
    key: 'tutor_ravi', seller: 'ravi', kind: 'service', title: 'Python help for CS 100', category: 'Tutoring',
    details: { course: 'CS 100', skills: ['Python', 'Debugging', 'Projects'], hourly_cents: 1800, first_discount_pct: 0, availability: [1, 3, 0, 6].flatMap((d) => [18, 19, 20].map((h) => ({ weekday: d, hour: h }))), mode: 'video', video_url: 'https://ua.zoom.us/j/passport-demo', bio: 'CS junior. Video sessions with screen share.' },
    ask: 1800, ageDays: 20, photo: '/seed/tutor.svg',
  });

  /* ---------- UAB ---------- */
  mk({
    key: 'stewart_tyler', seller: 'tyler_w', kind: 'textbook', title: 'Calculus: Early Transcendentals 9e', category: 'isbn:9781337613927',
    details: isbnDetails('stewart9', { course: 'MA 125', highlights: 'some' }), condition: 75, ask: 3200, suggested: 2800, open: true, ageDays: 5, photos: ['/seed/photos/calculus-desk.jpg'],
  });
  mk({
    key: 'chair_tyler', seller: 'tyler_w', kind: 'item', title: 'Gray accent chair with cushion', category: 'Furniture',
    details: { color: 'Gray' }, condition: 80, ask: 3500, floor: 3000, suggested: 4400, arena: true, open: true, ageDays: 6, photos: ['/seed/photos/chair.jpg'],
  });
  mk({
    key: 'fridge_chris', seller: 'chris_d', kind: 'item', title: 'Compact fridge with freezer', category: 'Appliances',
    details: { size: '2.7 cu ft' }, condition: 64, ask: 4000, suggested: 3900, ageDays: 3, photos: ['/seed/photos/fridge.jpg'],
  });
  mk({
    key: 'tutor_nina', seller: 'nina_r', kind: 'service', title: 'General Chemistry tutoring (CH 115)', category: 'Tutoring',
    details: { course: 'CH 115', skills: ['Stoichiometry', 'Gas laws', 'Lab reports'], hourly_cents: 2200, first_discount_pct: 25, availability: [1, 3, 5].flatMap((d) => [14, 15, 16].map((h) => ({ weekday: d, hour: h }))), mode: 'in_person' },
    ask: 2200, ageDays: 30, photo: '/seed/tutor.svg',
  });
  mk({
    key: 'blazers_tix', seller: 'jay_k', kind: 'ticket', title: 'UAB Blazers vs Memphis (2 tickets)', category: 'Tickets',
    details: { event: 'UAB vs Memphis', venue: 'Protective Stadium', date: isoDate(T0 + 9 * DAY), section: '118', row: 'F', quantity: 2, face_value_cents: 5000, transfer_method: 'App transfer', proof: true },
    ask: 5500, ageDays: 2, photo: '/seed/ticket.svg',
  });

  /* ---------- Auburn ---------- */
  mk({
    key: 'stewart_hannah', seller: 'hannah_j', kind: 'textbook', title: 'Stewart Calculus 9th ed. (MATH 1610)', category: 'isbn:9781337613927',
    details: isbnDetails('stewart9', { course: 'MATH 1610', highlights: 'none' }), condition: 90, ask: 4000, floor: 3500, suggested: 4000, arena: true, ageDays: 4, photos: ['/seed/photos/calculus-notes.jpg', '/seed/photos/calculus-stack.jpg'],
  });
  mk({
    key: 'micro_luis', seller: 'luis_m', kind: 'item', title: 'Microwave, 700W', category: 'Appliances',
    details: { brand: 'Hamilton Beach' }, condition: 78, ask: 3000, suggested: 3900, ageDays: 2, photos: ['/seed/photos/microwave.jpg'],
  });
  mk({
    key: 'ironbowl', seller: 'hannah_j', kind: 'ticket', title: 'Iron Bowl student ticket', category: 'Tickets',
    details: { event: 'Auburn vs Alabama (Iron Bowl)', venue: 'Jordan-Hare Stadium', date: isoDate(T0 + 40 * DAY), section: 'Student', row: 'GA', quantity: 1, face_value_cents: 12000, transfer_method: 'App transfer', proof: true },
    ask: 13800, ageDays: 1, photo: '/seed/ticket.svg', open: true,
  });
  mk({
    key: 'psych_tutor', seller: 'luis_m', kind: 'service', title: 'Intro Psych study sessions (PSYC 2010)', category: 'Tutoring',
    details: { course: 'PSYC 2010', skills: ['Exam prep', 'Flashcards'], hourly_cents: 1500, first_discount_pct: 0, availability: [2, 4, 0].flatMap((d) => [17, 18, 19].map((h) => ({ weekday: d, hour: h }))), mode: 'in_person' },
    ask: 1500, ageDays: 10, photo: '/seed/tutor.svg',
  });

  /* ---------- Starter marketplaces for the config-only campuses ---------- */
  extraCampuses.forEach((t, ti) => {
    for (let k = 0; k < 6; k++) {
      const [title, category, kind, photo, condition, cents] = STARTER[(ti * 2 + k) % STARTER.length];
      const seller = `${EXTRA_STUDENTS[k % EXTRA_STUDENTS.length][0].toLowerCase()}_${t.slug}`;
      mk({
        seller, kind, title, category, condition, ask: Math.round((cents * (0.85 + rand() * 0.3)) / 100) * 100, ageDays: 1 + Math.floor(rand() * 8), open: k % 3 === 0,
        photos: [`/seed/photos/${photo}.jpg`], details: kind === 'textbook' ? isbnDetails('stewart9', { highlights: 'some' }) : {},
      });
    }
  });

  /* ---------- History: completed trades so trust and reliability are real ---------- */
  const fillers: Record<string, string[]> = {
    ua: ['kim_s', 'alex_r', 'tori_m', 'ben_h', 'zoe_p', 'omar_a', 'lena_w', 'deshawn', 'sam_o', 'ellie_b'],
    uab: ['chris_d', 'ana_g', 'jay_k', 'mia_t'], auburn: ['grace_l', 'noah_b', 'ella_c', 'max_f'],
  };
  const pastTitles: [string, string, number][] = [
    ['Desk organizer', 'Dorm and decor', 1400], ['Rice cooker', 'Appliances', 2500], ['Bluetooth speaker', 'Electronics', 3000],
    ['Bean bag chair', 'Furniture', 3500], ['Rain jacket', 'Clothing', 2200], ['Monitor, 24 in.', 'Electronics', 7000],
    ['Shower caddy set', 'Dorm and decor', 800], ['Bookshelf', 'Furniture', 3000], ['Air fryer', 'Appliances', 4000], ['Scientific calculator', 'Electronics', 1500],
  ];
  const historyFor = (sellerH: string, n: number, opts: { noShows?: number; listingKey?: string; buyersFrom?: string[]; ratings?: boolean } = {}) => {
    const seller = U[sellerH];
    const tslug = db.tenants.find((t) => t.id === seller.tenant_id)!.slug;
    const pool = (opts.buyersFrom ?? fillers[tslug]).filter((h) => h !== sellerH);
    const tenant = ten(tslug);
    for (let i = 0; i < n + (opts.noShows ?? 0); i++) {
      const buyer = U[pool[i % pool.length]];
      const ended = T0 - (8 + i * 9 + Math.floor(rand() * 5)) * DAY;
      let l: Listing;
      if (opts.listingKey) l = L[opts.listingKey];
      else {
        const [title, cat, cents] = pastTitles[(i + sellerH.length) % pastTitles.length];
        l = mk({ seller: sellerH, kind: 'item', title, category: cat, condition: 70 + Math.floor(rand() * 25), ask: Math.round(cents * (0.85 + rand() * 0.3)), ageDays: Math.round((T0 - ended) / DAY) + 3 });
        l.status = 'sold';
      }
      const zone = pick(tenant.config.safeZones);
      const noShow = i >= n;
      const t: Trade = {
        id: id('trd'), tenant_id: seller.tenant_id, listing_id: l.id, need_id: null, buyer_id: buyer.id, seller_id: seller.id, kind: l.kind,
        state: noShow ? 'NO_SHOW' : 'COMPLETE', price_cents: l.ask_cents, slot_id: null, safe_zone: zone.id, payment_intent: `pi_mock_seed${i}`,
        escrow: noShow ? 'cancelled' : 'captured', hold_expires_at: ended - HOUR, created_at: ended - 2 * HOUR, ended_at: ended, cross_campus: false, tip_cents: 0,
      };
      const slot = { id: id('slt'), trade_id: t.id, starts_at: ended - 20 * MIN, ends_at: ended + 10 * MIN, safe_zone: zone.id, zone_tenant_id: seller.tenant_id, mode: (l.kind === 'service' ? 'in_person' : 'in_person') as 'in_person' };
      db.slots.push(slot);
      t.slot_id = slot.id;
      db.trades.push(t);
      for (const [type, actor, dt] of [['claim', buyer.id, -2 * HOUR], ['accept_ask', buyer.id, -110 * MIN], ['book', buyer.id, -100 * MIN]] as const) {
        db.trade_events.push({ id: id('tev'), trade_id: t.id, type, actor_id: actor, payload: {}, created_at: ended + dt });
      }
      if (noShow) {
        db.outcomes.push({ id: id('out'), trade_id: t.id, result: 'no_show', reason: null, at_fault: [seller.id], created_at: ended });
        db.trade_events.push({ id: id('tev'), trade_id: t.id, type: 'slot_lapsed', actor_id: 'system', payload: {}, created_at: ended });
        continue;
      }
      db.scans.push({ id: id('scn'), trade_id: t.id, user_id: buyer.id, scanned_at: ended - 2 * MIN, method: 'qr' });
      db.scans.push({ id: id('scn'), trade_id: t.id, user_id: seller.id, scanned_at: ended, method: 'qr' });
      db.trade_events.push({ id: id('tev'), trade_id: t.id, type: 'both_scanned', actor_id: 'system', payload: {}, created_at: ended });
      db.outcomes.push({ id: id('out'), trade_id: t.id, result: 'completed', reason: null, created_at: ended });
      if (l.kind !== 'service') {
        passport(l, 'stamp', { from: seller.handle, to: buyer.handle, cents: t.price_cents, where: zone.name, method: 'dual scan' }, ended);
        db.sales.push({ id: id('sal'), tenant_id: l.tenant_id, category: l.category, cents: t.price_cents!, at: ended });
      }
      if (opts.ratings) db.ratings.push({ id: id('rtg'), trade_id: t.id, rater_id: buyer.id, ratee_id: seller.id, stars: rand() < 0.85 ? 5 : 4, created_at: ended + HOUR });
    }
  };
  historyFor('marcus_t', 12, { noShows: 2 });
  historyFor('maya_k', 9, { listingKey: 'tutor_maya', ratings: true });
  historyFor('ravi', 4, { listingKey: 'tutor_ravi', ratings: true });
  historyFor('deshawn', 5, { noShows: 1 });
  historyFor('sam_o', 3);
  historyFor('tyler_w', 6);
  historyFor('nina_r', 7, { listingKey: 'tutor_nina', ratings: true });
  historyFor('hannah_j', 4);
  historyFor('luis_m', 2);
  historyFor('jay_k', 3);
  historyFor('ellie_b', 2, { buyersFrom: ['jordan', 'tori_m'] });
  historyFor('omar_a', 1, { buyersFrom: ['jordan'] });

  /* ---------- Course Kits and needs for demo students ---------- */
  const needReq = (key: string, label: string, value: any, must = false): Requirement => ({ key, label, value, must, weight: must ? 3 : 1 });
  const addKit = (handle: string, codes: string[], sorted: Record<string, string>) => {
    const u = U[handle];
    for (const code of codes) {
      const c = db.courses.find((x) => x.tenant_id === u.tenant_id && x.code === code)!;
      db.user_courses.push({ tenant_id: u.tenant_id, user_id: u.id, course_id: c.id, added_at: T0 - 3 * DAY });
      for (const cb of db.course_books.filter((x) => x.course_id === c.id)) {
        const b = db.books.find((x) => x.id === cb.book_id)!;
        const src = sorted[code];
        db.needs.push({
          id: id('ned'), tenant_id: u.tenant_id, user_id: u.id, kind: 'textbook', course_id: c.id, book_id: b.id,
          free_text: `${c.code} textbook: ${b.title}${b.edition ? `, ${ord(b.edition)} ed.` : ''}`,
          requirements: [needReq('isbn', `ISBN ${b.isbn}`, b.isbn, true), ...(b.edition ? [needReq('edition', `${ord(b.edition)} edition`, b.edition, true)] : [])],
          status: src ? 'sorted' : 'watching', prefs: {}, parsed_by: 'rules', created_at: T0 - 3 * DAY,
        });
        if (src) {
          const cents = src === 'open_access' || src === 'library' ? 0 : src === 'campus' ? 1000 : (b.prices as any)[src] ?? 0;
          db.kit_choices.push({ tenant_id: u.tenant_id, user_id: u.id, book_id: b.id, source: src, cents });
        }
      }
    }
  };
  addKit('jordan', ['MATH 125', 'CH 101', 'EC 110', 'EN 101'], { 'CH 101': 'open_access', 'EN 101': 'campus' });
  addKit('priya', ['MA 125', 'CH 115', 'EC 211'], { 'CH 115': 'open_access' });
  addKit('cole', ['MATH 1610', 'ECON 2020', 'PSYC 2010'], { 'PSYC 2010': 'open_access' });

  const oneOff = (handle: string, kind: Kind, text: string, reqs: Requirement[]) => {
    const u = U[handle];
    db.needs.push({ id: id('ned'), tenant_id: u.tenant_id, user_id: u.id, kind, free_text: text, requirements: reqs, status: 'watching', prefs: {}, parsed_by: 'rules', created_at: T0 - 2 * DAY });
  };
  oneOff('jordan', 'item', 'Mini fridge under $70', [needReq('keywords', 'Fridge', ['fridge'], true), needReq('maxPriceCents', 'Under $70', 7000)]);
  oneOff('jordan', 'ticket', '2 tickets to the Georgia game', [needReq('event', 'Georgia game', 'georgia', true), needReq('quantity', '2 tickets', 2, true)]);
  oneOff('jordan', 'service', 'Calc tutor, Tuesdays', [needReq('keywords', 'Calculus', ['calc'], true), needReq('weekday', 'Free Tuesdays', 2)]);
  oneOff('priya', 'item', 'Desk chair', [needReq('keywords', 'Chair', ['chair'], true)]);
  oneOff('cole', 'item', 'Microwave for my dorm', [needReq('keywords', 'Microwave', ['microwave'], true)]);

  /* ---------- A live trade so the seller side has something to do ---------- */
  {
    const l = L['headphones_marcus'];
    const t: Trade = {
      id: id('trd'), tenant_id: l.tenant_id, listing_id: l.id, need_id: null, buyer_id: U['tori_m'].id, seller_id: l.seller_id, kind: 'item', state: 'HELD',
      price_cents: null, pending_offer_cents: 7200, slot_id: null, safe_zone: null, payment_intent: null, escrow: 'none',
      hold_expires_at: T0 + 25 * MIN, created_at: T0 - 5 * MIN, ended_at: null, cross_campus: false, tip_cents: 0,
    };
    l.status = 'held';
    db.trades.push(t);
    db.trade_events.push({ id: id('tev'), trade_id: t.id, type: 'claim', actor_id: t.buyer_id, payload: {}, created_at: T0 - 5 * MIN });
    db.trade_events.push({ id: id('tev'), trade_id: t.id, type: 'offer', actor_id: t.buyer_id, payload: { cents: 7200 }, created_at: T0 - 4 * MIN });
    db.notifications.push({ id: id('ntf'), tenant_id: l.tenant_id, user_id: l.seller_id, type: 'offer', title: '@tori_m offered $72', body: 'For your wireless headphones. Below your floor, so it needs you.', link: `/trade/${t.id}`, read: false, created_at: T0 - 4 * MIN });
  }

  /* ---------- Carriers ---------- */
  const carrier = (h: string, from: string, to: string, at: number, tip: number, note: string) =>
    db.carriers.push({ id: id('car'), tenant_id: U[h].tenant_id, user_id: U[h].id, from_tenant: `ten_${from}`, to_tenant: `ten_${to}`, travels_on: at, tip_cents: tip, seats: 3, note });
  carrier('ravi', 'ua', 'uab', nextDow(T0, 4, 17), 300, 'Driving up for a lab. Trunk space for books and small items.');
  carrier('maya_k', 'ua', 'uab', nextDow(T0, 5, 10), 300, 'Seeing friends in Birmingham. Room for a box or two.');
  carrier('ravi', 'ua', 'uab', nextDow(T0, 4, 17) + 7 * DAY, 300, 'Same trip, next week.');
  carrier('nina_r', 'uab', 'ua', nextDow(T0, 5, 12), 300, 'Visiting my sister in Tuscaloosa.');
  carrier('hannah_j', 'auburn', 'ua', nextDow(T0, 6, 11) + 7 * DAY, 500, 'Game weekend trip.');
  carrier('luis_m', 'auburn', 'uab', nextDow(T0, 0, 15), 400, 'Heading home to Birmingham.');

  db.notifications.push({ id: id('ntf'), tenant_id: U['jordan'].tenant_id, user_id: U['jordan'].id, type: 'match', title: 'New match for MATH 125', body: '@marcus_t has the 9th edition, 9 minutes away.', link: `/listing/${L['stewart_marcus'].id}`, read: false, created_at: T0 - 30 * MIN });

  /* ---------- UA price history: 12 completed sales per category, so every median is believable ---------- */
  const ua = ten('ua');
  db.sales = db.sales.filter((x) => x.tenant_id !== ua.id);
  for (const [cat, med] of Object.entries(UA_MEDIANS)) {
    SALE_SPREAD.forEach((k, i) => {
      db.sales.push({ id: id('sal'), tenant_id: ua.id, category: cat, cents: Math.round((med * k) / 100) * 100, at: T0 - (2 + i * 4) * DAY - Math.floor(rand() * 20) * HOUR });
    });
  }

  /* ---------- A year of older sales with the campus calendar in them: August move-in is dear, May move-out is cheap ---------- */
  for (const t of db.tenants) {
    const medians = t.id === ua.id ? UA_MEDIANS : BASE_SALES;
    for (const [cat, med] of Object.entries(medians)) {
      for (let d = 50; d <= 365; d += 6 + Math.floor(rand() * 6)) {
        const at = T0 - d * DAY;
        db.sales.push({ id: id('sal'), tenant_id: t.id, category: cat, cents: Math.round((med * (t.config.season ?? SEASON)[new Date(at).getMonth()] * (0.9 + rand() * 0.2)) / 100) * 100, at });
      }
    }
  }

  db.meta.seeded_at = T0;
  return db;
}

function nextDow(from: number, dow: number, hour: number) {
  const d = new Date(from);
  d.setHours(hour, 0, 0, 0);
  const diff = (dow - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.getTime();
}
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
