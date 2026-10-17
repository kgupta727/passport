import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../api';
import { TradeFocus } from '../components/TradeFocus';
import { Empty, Row } from '../components/ui';
import { Icon } from '../components/Icon';
import { ago } from '../format';

const EV: Record<string, string> = {
  claim: 'Claimed, hold started', offer: 'Offer sent', auto_accepted: 'Auto-accepted at floor', accept_offer: 'Offer accepted', decline_offer: 'Kept the asking price',
  accept_ask: 'Took the asking price', fixed_price: 'Hourly rate locked', arena_price: 'Price picked after the duel', book: 'Booked, escrow funded', arrive: 'Arrived at the spot',
  scan: 'Scanned', both_scanned: 'Both scanned', transfer_sent: 'Ticket transfer sent', confirm_receipt: 'Ticket received', auto_release: 'Escrow auto-released',
  session_end: 'Session ended, escrow released', hold_expired: 'Hold expired', slot_lapsed: 'Slot ended without a full handoff', cancel: 'Cancelled', problem: 'Problem reported',
  resolve: 'Resolved by admin', payment_error: 'Payment error',
};

export function TradePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error } = useApi<any>(`/trades/${id}`, { poll: 5000 });
  const [log, setLog] = useState(false);
  if (error) return <Empty icon="trades" title="Trade not found" body={error} />;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => nav('/trades')} className="w-11 h-11 -ml-2 grid place-items-center rounded-full" aria-label="Back to trades"><Icon name="chevronLeft" /></button>
        {data && <span className="text-[13px] font-extrabold text-ink-soft">with @{data.counterpart?.handle}, trust {data.counterpart?.trust_level}</span>}
      </div>
      <TradeFocus tradeId={id!} />

      {data && (
        <div className="mt-8 space-y-4">
          {data.notes_for_buyer && data.role === 'buyer' && (
            <div className="card p-5"><p className="label mb-1">Notes from the seller</p><p className="font-bold">{data.notes_for_buyer}</p></div>
          )}
          <div className="card px-5 py-2">
            {data.trade.pay_mode === 'reservation'
              ? <Row label="Payment" value="In person at the handoff, nothing held by Passport" icon="lock" />
              : <Row label="Escrow" value={{ none: 'Not funded yet', authorized: 'Held, not released', captured: 'Released to seller', cancelled: 'Released back to buyer', refunded: 'Refunded' }[data.trade.escrow as string]} icon="lock" />}
            {data.slot && data.slot.mode === 'in_person' && <Row label="Safe zone" value={data.slot.zone?.name} icon="pin" />}
            {data.carrier && <Row label="Carrier" value={`@${data.carrier.handle}`} icon="car" />}
            <Row label="Passport" value={<Link to={`/listing/${data.listing.id}`} className="underline">Open</Link>} icon="stamp" />
          </div>
          <button className="btn-quiet text-[14px]" onClick={() => setLog(!log)} aria-expanded={log}>{log ? 'Hide' : 'Show'} the trade record ({data.events.length})</button>
          {log && (
            <ol className="card p-5 space-y-2">
              {data.events.map((e: any, i: number) => (
                <li key={i} className="flex justify-between gap-3 text-[14px]"><span className="font-extrabold">{e.type === 'book' && data.trade.pay_mode === 'reservation' ? 'Booked, pay in person' : EV[e.type] ?? e.type}{e.actor && e.actor !== 'system' ? ` (@${e.actor})` : ''}</span><span className="text-ink-soft font-bold whitespace-nowrap">{ago(e.at, data.server_now)}</span></li>
              ))}
              <li className="text-[12px] text-ink-soft font-bold pt-2">Append-only. State changes only through the server's advance_trade; this app never writes it directly.</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
