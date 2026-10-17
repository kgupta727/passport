import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type Kind = 'item' | 'textbook' | 'ticket' | 'service';
export type PaymentsMode = 'reservation' | 'escrow';
export type TradeState =
  | 'HELD' | 'PRICED' | 'BOOKED' | 'COMPLETE'
  | 'EXPIRED' | 'CANCELLED' | 'NO_SHOW' | 'REFUNDED' | 'DISPUTED' | 'RESOLVED';

export interface SafeZone { id: string; name: string; lat: number; lng: number }
export interface TenantConfig {
  displayName: string;
  city: string;
  safeZones: SafeZone[];
  housing: { id: string; name: string }[];
  walk: Record<string, Record<string, number>>;
  library: { name: string; url: string };
  courseCatalog: string;
  shuttleDays: { to: string; weekday: number; label: string }[];
  ticketPriceCap: number;
  geofenceRequired: boolean;
  features: { arena: boolean; tickets: boolean; services: boolean; crossCampus: boolean; chat: boolean; explore?: boolean };
  map: { center: [number, number]; zoom: number; bounds: [[number, number], [number, number]] };
  /** Groups items into "the same model" for scarcity. Falls back to the category. */
  rarityModels?: { key: string; match: string[] }[];
  /** Local placeholder copy, so example text never names another school. */
  examples?: { event?: string; needs?: string[] };
  /** Light per-campus customization: brand color, default payment mode, resale calendar (Jan..Dec multipliers). */
  brand?: { color: string };
  payments?: PaymentsMode;
  season?: number[];
}
export interface Tenant { id: string; slug: string; name: string; short: string; domains: string[]; config: TenantConfig }

export interface User {
  id: string; tenant_id: string; email: string; handle: string; name: string;
  housing: string; trust_credit: number; is_admin?: boolean; demo?: boolean; created_at: number;
}
export interface MagicLink { token: string; email: string; tenant_id: string; expires_at: number; used: boolean }

export interface Course { id: string; tenant_id: string; code: string; title: string }
export interface RefPrices { ebook?: number; rental?: number; used_online?: number; new?: number }
export interface Book {
  id: string; isbn: string; title: string; edition: number | null; author: string;
  open_access_url?: string; library_url?: string; prices: RefPrices;
}
export interface CourseBook { course_id: string; book_id: string; required: boolean }
export interface UserCourse { tenant_id: string; user_id: string; course_id: string; added_at: number }
export interface KitChoice { tenant_id: string; user_id: string; book_id: string; source: string; cents: number }

export interface Requirement {
  key: string; label: string; value: any; weight: number; must: boolean;
}
export interface Need {
  id: string; tenant_id: string; user_id: string; kind: Kind; course_id?: string; book_id?: string;
  free_text: string; requirements: Requirement[]; status: 'watching' | 'sorted' | 'closed';
  prefs: { maxMinutes?: number; minReliability?: number; maxPriceCents?: number };
  parsed_by: 'llm' | 'rules'; created_at: number;
}

export interface Listing {
  id: string; tenant_id: string; seller_id: string; kind: Kind; title: string; category: string;
  details: Record<string, any>; condition: number; ask_cents: number; floor_cents: number | null;
  suggested_cents: number | null; arena_on: boolean; visibility: 'campus' | 'open';
  photo?: string; photos?: string[]; notes_for_buyer?: string; lineage_id: string;
  free_windows: { weekday: number; hour: number }[];
  last_confirmed_at: number; status: 'active' | 'held' | 'sold' | 'hidden'; created_at: number;
  rarity_tier?: RarityTier; rarity_score?: number;
  rarity_inputs?: { model: string; n: number; C: number; D: number; S_cents: number | null };
}
export type RarityTier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface PassportEvent {
  id: string; tenant_id: string; listing_id: string; lineage_id: string;
  type: 'listed' | 'stamp' | 'price' | 'arena' | 'verified' | 'confirmed' | 'answer' | 'owner';
  payload: Record<string, any>; created_at: number;
}
export interface Trade {
  id: string; tenant_id: string; listing_id: string; need_id: string | null;
  buyer_id: string; seller_id: string; carrier_id?: string | null; kind: Kind;
  state: TradeState; price_cents: number | null; pending_offer_cents?: number | null;
  slot_id: string | null; safe_zone: string | null; payment_intent: string | null; escrow: 'none' | 'authorized' | 'captured' | 'cancelled' | 'refunded';
  /** Fixed at booking. Reservation: no money moves, the dual scan completes the trade. */
  pay_mode?: PaymentsMode;
  hold_expires_at: number; created_at: number; ended_at?: number | null;
  checked_in?: boolean; transfer_proof?: string | null; transfer_sent_at?: number | null;
  cross_campus?: boolean; tip_cents?: number;
}
export interface TradeEvent { id: string; trade_id: string; type: string; actor_id: string; payload: Record<string, any>; created_at: number }
export interface Slot {
  id: string; trade_id: string; starts_at: number; ends_at: number; safe_zone: string;
  zone_tenant_id: string; mode: 'in_person' | 'video' | 'digital'; video_url?: string;
}
export interface Scan { id: string; trade_id: string; user_id: string; scanned_at: number; method: 'qr' | 'code' | 'demo' | 'tap' }
export interface Arrival { id: string; trade_id: string; user_id: string; at: number; distance_m: number | null }
export interface ArenaMatch {
  id: string; trade_id: string; state: 'proposed' | 'waiting' | 'live' | 'resolved' | 'priced';
  /** Agreed before anyone plays: the price if the buyer wins, the price if the seller wins. Both must accept. */
  stake_buyer?: number; stake_seller?: number; accepted?: string[];
  p1_id: string; p2_id: string; p1_move: string | null; p2_move: string | null;
  p1_opened_at: number | null; p2_opened_at: number | null; round: number;
  history: { p1: string; p2: string; result: string }[];
  winner_id: string | null; range_low: number; range_high: number; created_at: number;
}
export interface Outcome { id: string; trade_id: string; result: string; reason: string | null; at_fault?: string[]; created_at: number }
export interface Carrier { id: string; tenant_id: string; user_id: string; from_tenant: string; to_tenant: string; travels_on: number; tip_cents: number; seats: number; note?: string }
export interface Message { id: string; tenant_id: string; trade_id: string; sender_id: string; body: string; created_at: number; reported: boolean }
export interface Question { id: string; tenant_id: string; listing_id: string; need_id: string; asker_id: string; key: string; prompt: string; options: string[]; answer: string | null; created_at: number }
export interface Notification { id: string; tenant_id: string; user_id: string; type: string; title: string; body: string; link: string; read: boolean; created_at: number }
export interface Rating { id: string; trade_id: string; rater_id: string; ratee_id: string; stars: number; created_at: number }
export interface Sale { id: string; tenant_id: string; category: string; cents: number; at: number }

export interface DB {
  tenants: Tenant[];
  tenant_domains: { domain: string; tenant_id: string }[];
  users: User[];
  magic_links: MagicLink[];
  courses: Course[];
  books: Book[];
  course_books: CourseBook[];
  user_courses: UserCourse[];
  kit_choices: KitChoice[];
  needs: Need[];
  listings: Listing[];
  passport_events: PassportEvent[];
  trades: Trade[];
  trade_events: TradeEvent[];
  slots: Slot[];
  scans: Scan[];
  arrivals: Arrival[];
  arena_matches: ArenaMatch[];
  outcomes: Outcome[];
  carriers: Carrier[];
  messages: Message[];
  questions: Question[];
  notifications: Notification[];
  ratings: Rating[];
  sales: Sale[];
  cache: Record<string, any>;
  meta: { clock_offset_ms: number; seeded_at: number; version: number; payments_mode?: PaymentsMode };
}

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const DB_VERSION = 5;

export function emptyDB(): DB {
  return {
    tenants: [], tenant_domains: [], users: [], magic_links: [], courses: [], books: [], course_books: [],
    user_courses: [], kit_choices: [], needs: [], listings: [], passport_events: [], trades: [], trade_events: [],
    slots: [], scans: [], arrivals: [], arena_matches: [], outcomes: [], carriers: [], messages: [], questions: [],
    notifications: [], ratings: [], sales: [], cache: {},
    meta: { clock_offset_ms: 0, seeded_at: Date.now(), version: DB_VERSION },
  };
}

export let db: DB = emptyDB();

export function loadDB(seed: () => DB): DB {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) as DB;
      if (parsed.meta?.version === DB_VERSION) {
        db = parsed;
        return db;
      }
    } catch {
      /* fall through to reseed */
    }
  }
  db = seed();
  saveNow();
  return db;
}

export function replaceDB(next: DB) {
  db = next;
  saveNow();
}

const beforeSaveHooks: (() => void)[] = [];
/** Derived fields (like listing rarity) recompute on every write, so they can never go stale. */
export function beforeSave(fn: () => void) { beforeSaveHooks.push(fn); }

let saveTimer: NodeJS.Timeout | null = null;
export function save() {
  beforeSaveHooks.forEach((fn) => fn());
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveNow();
  }, 150);
}
export function saveNow() {
  beforeSaveHooks.forEach((fn) => fn());
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

export const id = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

/** Server clock. The demo can fast-forward it to show timers firing; everything time-based reads this. */
export const now = () => Date.now() + (db.meta?.clock_offset_ms ?? 0);

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Tenant-scoped read: the in-process equivalent of the RLS policy. */
export function scoped<T extends { tenant_id: string }>(rows: T[], tenantId: string): T[] {
  return rows.filter((r) => r.tenant_id === tenantId);
}

/** RLS for listings: own tenant, or visibility = 'open' (cross-campus). */
export function visibleListings(tenantId: string): Listing[] {
  return db.listings.filter((l) => l.tenant_id === tenantId || l.visibility === 'open');
}

/** Campuses this user has an upcoming trip to. A trip opens that campus's listings to the traveller. */
export function tripTenantIds(u: User): string[] {
  const t = now();
  return [...new Set(db.carriers.filter((c) => c.user_id === u.id && c.travels_on > t).map((c) => c.to_tenant))];
}
export function visibleListingsFor(u: User): Listing[] {
  const trips = tripTenantIds(u);
  return db.listings.filter((l) => l.tenant_id === u.tenant_id || l.visibility === 'open' || trips.includes(l.tenant_id));
}

export const userById = (uid: string) => db.users.find((u) => u.id === uid);
export const tenantById = (tid: string) => db.tenants.find((t) => t.id === tid)!;
