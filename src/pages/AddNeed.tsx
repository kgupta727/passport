import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mutate } from '../api';
import { Icon, KIND_ICON } from '../components/Icon';
import { ErrorNote, PageHeader } from '../components/ui';
import { Kind } from '../format';
import { useMe } from '../me';

const CATS: { kind: Kind; label: string; tone: string; examples: string[] }[] = [
  { kind: 'textbook', label: 'Textbook', tone: 't-sky', examples: ['Stewart Calculus 9th edition, no highlights', 'Mankiw micro 9th ed under $30'] },
  { kind: 'item', label: 'Item', tone: 't-peach', examples: ['Mini fridge under $70', 'Desk lamp', 'Hybrid bike'] },
  { kind: 'ticket', label: 'Ticket', tone: 't-butter', examples: ['2 tickets to the next home game', 'Basketball, 1 seat'] },
  { kind: 'service', label: 'Tutoring', tone: 't-lilac', examples: ['Calc tutor, Tuesdays', 'Python help, intro CS'] },
];

export function AddNeed() {
  const nav = useNavigate();
  const { me } = useMe();
  const [kind, setKind] = useState<Kind>('item');
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = CATS.find((c) => c.kind === kind)!;
  const local = me.tenant.config.examples?.needs;
  const cat = kind === 'ticket' && local?.length ? { ...base, examples: local } : base;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const n = await mutate('/needs', { kind, text });
      nav(`/needs/${n.id}`, { replace: true });
    } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit}>
      <PageHeader title="Add a need" sub="Say it how you would text a friend. Passport turns it into requirements and watches for offers." back={() => nav(-1)} />
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-2">
        {CATS.map((c) => (
          <button type="button" key={c.kind} data-on={kind === c.kind} onClick={() => setKind(c.kind)} className={`tile ${c.tone} shrink-0 h-12 px-4 flex items-center gap-2 font-extrabold`}>
            <Icon name={KIND_ICON[c.kind]} size={19} />{c.label}
          </button>
        ))}
      </div>
      <label className="label block mt-5 mb-2" htmlFor="need">What are you looking for?</label>
      <textarea id="need" className="input !text-[17px]" placeholder={cat.examples[0]} value={text} onChange={(e) => setText(e.target.value)} maxLength={200} autoFocus />
      <div className="flex flex-wrap gap-2 mt-3">
        {cat.examples.map((x) => <button type="button" key={x} onClick={() => setText(x)} className="btn-secondary !min-h-[40px] !text-[14px] !rounded-full">{x}</button>)}
      </div>
      {kind === 'textbook' && (
        <Link to="/kit" className="flex items-center gap-3 mt-5 rounded-[20px] bg-sky p-4 font-bold">
          <Icon name="kit" className="text-sky-deep" />For class books, the Course Kit finds the exact edition and free options for you.<Icon name="chevronRight" className="ml-auto shrink-0" />
        </Link>
      )}
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full mt-6" disabled={busy || text.trim().length < 3}>{busy ? 'Reading your need...' : 'Find offers'}</button>
    </form>
  );
}
