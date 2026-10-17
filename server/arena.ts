import crypto from 'node:crypto';
import { db, id, now, save, ArenaMatch, userById } from './db.js';
import { HttpError, listingOf, notify } from './trade.js';
import { money } from './logic.js';

export const DUEL_MS = 20_000;
const MOVES = ['rock', 'paper', 'scissors'] as const;
type Move = (typeof MOVES)[number];
const BEATS: Record<Move, Move> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const randomMove = (): Move => MOVES[crypto.randomInt(3)];

export function startDuel(tradeId: string, uid: string): ArenaMatch {
  const t = db.trades.find((x) => x.id === tradeId);
  if (!t) throw new HttpError(404, 'Trade not found');
  if (t.buyer_id !== uid) throw new HttpError(403, 'The buyer starts the duel');
  if (t.state !== 'HELD') throw new HttpError(409, 'Duels happen while the item is held');
  const l = listingOf(t);
  if (!l.arena_on || (l.kind !== 'item' && l.kind !== 'textbook')) throw new HttpError(400, 'This seller did not opt in to Price Duel');
  const existing = db.arena_matches.find((m) => m.trade_id === t.id && m.state !== 'priced');
  if (existing) return existing;
  const S = l.suggested_cents ?? l.ask_cents;
  const m: ArenaMatch = {
    id: id('arn'), trade_id: t.id, state: 'waiting', p1_id: t.buyer_id, p2_id: t.seller_id, p1_move: null, p2_move: null,
    p1_opened_at: now(), p2_opened_at: null, round: 1, history: [], winner_id: null,
    range_low: Math.round((S * 0.8) / 50) * 50, range_high: Math.round((S * 1.2) / 50) * 50, created_at: now(),
  };
  m.state = 'proposed';
  m.stake_buyer = Math.round(Math.min(l.ask_cents, S) * 0.85 / 100) * 100;
  m.stake_seller = Math.max(m.stake_buyer, Math.round(Math.max(l.ask_cents, S) / 100) * 100);
  m.stake_buyer = Math.max(m.range_low, m.stake_buyer);
  m.stake_seller = Math.min(m.range_high, m.stake_seller);
  m.accepted = [];
  db.arena_matches.push(m);
  save();
  return m;
}

/** Either side can propose stakes; proposing counts as your acceptance and resets theirs. */
export function setStakes(m: ArenaMatch, uid: string, buyerWins: number, sellerWins: number) {
  if (m.state !== 'proposed') throw new HttpError(409, 'The stakes are already agreed');
  const a = Math.round(Number(buyerWins)), b = Math.round(Number(sellerWins));
  if (!(a >= m.range_low && b <= m.range_high && a <= b)) throw new HttpError(400, `Both prices must be between ${money(m.range_low)} and ${money(m.range_high)}, and the buyer's price cannot be higher than the seller's`);
  m.stake_buyer = a;
  m.stake_seller = b;
  m.accepted = [uid];
  const other = isP1(m, uid) ? m.p2_id : m.p1_id;
  notify(other, 'duel', `@${userById(uid)?.handle} proposed Price Duel stakes`, `Buyer wins: ${money(a)}. Seller wins: ${money(b)}. Accept to play.`, `/trade/${m.trade_id}?duel=1`);
  save();
}

export function acceptStakes(m: ArenaMatch, uid: string) {
  if (m.state !== 'proposed') return;
  m.accepted = [...new Set([...(m.accepted ?? []), uid])];
  if (m.accepted.includes(m.p1_id) && m.accepted.includes(m.p2_id)) {
    m.state = 'waiting';
    m.p1_opened_at = m.p2_opened_at = null;
    openDuel(m, uid);
  }
  save();
}

/** The agreed price for whoever won. */
export const winnerPrice = (m: ArenaMatch) => (m.winner_id === m.p1_id ? m.stake_buyer : m.stake_seller) ?? null;

const isP1 = (m: ArenaMatch, uid: string) => m.p1_id === uid;

export function openDuel(m: ArenaMatch, uid: string) {
  if (m.p1_id !== uid && m.p2_id !== uid) throw new HttpError(403, 'Not your duel');
  if (m.state === 'proposed') return;
  if (isP1(m, uid)) m.p1_opened_at ??= now();
  else m.p2_opened_at ??= now();
  if (m.state === 'waiting' && m.p1_opened_at && m.p2_opened_at) m.state = 'live';
  save();
}

export function deadline(m: ArenaMatch) {
  if (!m.p1_opened_at || !m.p2_opened_at) return null;
  return Math.max(m.p1_opened_at, m.p2_opened_at) + DUEL_MS;
}

export function playMove(m: ArenaMatch, uid: string, move: string) {
  if (!MOVES.includes(move as Move)) throw new HttpError(400, 'Pick rock, paper or scissors');
  if (m.state === 'resolved' || m.state === 'priced') throw new HttpError(409, 'This duel is over');
  if (m.state === 'proposed') throw new HttpError(409, 'Agree on the stakes first');
  openDuel(m, uid);
  if (isP1(m, uid)) { if (m.p1_move) throw new HttpError(409, 'Already played this round'); m.p1_move = move; }
  else { if (m.p2_move) throw new HttpError(409, 'Already played this round'); m.p2_move = move; }
  if (m.p1_move && m.p2_move) resolveRound(m);
  save();
}

/** Demo helper: the server plays a random move for the other side. */
export function autoplayOther(m: ArenaMatch, uid: string) {
  const otherId = isP1(m, uid) ? m.p2_id : m.p1_id;
  if (m.state === 'proposed') { acceptStakes(m, otherId); return; }
  openDuel(m, otherId);
  if (isP1(m, otherId) ? !m.p1_move : !m.p2_move) playMove(m, otherId, randomMove());
}

function resolveRound(m: ArenaMatch) {
  const a = m.p1_move as Move, b = m.p2_move as Move;
  if (a === b) {
    m.history.push({ p1: a, p2: b, result: 'tie' });
    m.p1_move = m.p2_move = null;
    m.round += 1;
    m.p1_opened_at = m.p2_opened_at = now();
    return;
  }
  const p1wins = BEATS[a] === b;
  m.history.push({ p1: a, p2: b, result: p1wins ? 'p1' : 'p2' });
  m.winner_id = p1wins ? m.p1_id : m.p2_id;
  m.state = 'resolved';
  const t = db.trades.find((x) => x.id === m.trade_id)!;
  const loser = p1wins ? m.p2_id : m.p1_id;
  notify(loser, 'duel', `@${userById(m.winner_id)?.handle} won the duel`, `The price is ${money(winnerPrice(m))}, as you both agreed.`, `/trade/${t.id}`);
}

export function tickArena() {
  const t = now();
  for (const m of db.arena_matches) {
    if (m.state !== 'live') continue;
    const d = deadline(m);
    if (d && t > d) {
      if (!m.p1_move) m.p1_move = randomMove();
      if (!m.p2_move) m.p2_move = randomMove();
      resolveRound(m);
    }
  }
}

export function duelView(m: ArenaMatch, uid: string) {
  const me1 = isP1(m, uid);
  return {
    id: m.id, trade_id: m.trade_id, state: m.state, round: m.round,
    my_move: me1 ? m.p1_move : m.p2_move,
    they_moved: !!(me1 ? m.p2_move : m.p1_move),
    they_opened: !!(me1 ? m.p2_opened_at : m.p1_opened_at),
    history: m.history.map((h) => ({ mine: me1 ? h.p1 : h.p2, theirs: me1 ? h.p2 : h.p1, result: h.result === 'tie' ? 'tie' : (h.result === 'p1') === me1 ? 'win' : 'loss' })),
    winner_is_me: m.winner_id ? m.winner_id === uid : null,
    deadline: deadline(m),
    server_now: now(),
    range_low: m.range_low, range_high: m.range_high,
    i_am_buyer: me1, stake_buyer: m.stake_buyer ?? null, stake_seller: m.stake_seller ?? null,
    i_accepted: (m.accepted ?? []).includes(uid), they_accepted: (m.accepted ?? []).includes(me1 ? m.p2_id : m.p1_id),
    price: m.winner_id ? winnerPrice(m) : null,
    opponent: userById(me1 ? m.p2_id : m.p1_id)?.handle,
  };
}
