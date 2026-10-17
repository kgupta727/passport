import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, refreshAll, useApi } from '../api';
import { useMe } from '../me';
import { Icon } from '../components/Icon';
import { Chip, Empty, ErrorNote, PageHeader, Row, Skeleton } from '../components/ui';
import { plural } from '../format';

const SAMPLE_CONFIG = `{
  "slug": "samford",
  "name": "Samford University",
  "short": "Samford",
  "domains": ["samford.edu"],
  "config": {
    "city": "Homewood",
    "safeZones": [
      { "id": "davis", "name": "Davis Library entrance", "lat": 33.4651, "lng": -86.7930 },
      { "id": "uc", "name": "University Center lobby", "lat": 33.4637, "lng": -86.7920 },
      { "id": "police", "name": "Campus police lobby", "lat": 33.4628, "lng": -86.7905 }
    ],
    "housing": [
      { "id": "vail", "name": "Vail Hall", "lat": 33.4667, "lng": -86.7939 },
      { "id": "west", "name": "West Village", "lat": 33.4618, "lng": -86.7962 }
    ],
    "library": { "name": "Davis Library", "url": "https://library.samford.edu/" },
    "examples": { "event": "Samford vs Furman", "needs": ["2 tickets to the Furman game", "Basketball, 1 seat"] }
  }
}`;

const SAMPLE_CSV = `code,title,isbn,book_title,author,edition,required
MATH 240,Calculus I,9781337613927,,,,yes
ECON 201,Principles of Microeconomics,9780357133484,,,,yes
UCCA 102,Cultural Perspectives,9780190276522,Cultural Perspectives Reader,Samford Faculty,1,yes
BIOL 110,General Biology,,,,,`;

function FilePick({ label, accept, onText }: { label: string; accept: string; onText: (t: string) => void }) {
  return (
    <label className="btn-quiet text-[13px] cursor-pointer inline-flex items-center gap-1">
      <Icon name="plus" size={15} />{label}
      <input type="file" accept={accept} className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) onText(await f.text()); e.target.value = ''; }} />
    </label>
  );
}

export function AdminCampuses() {
  const nav = useNavigate();
  const { me } = useMe();
  const { data, error, reload } = useApi<any>(me.platform_admin ? '/admin/campuses' : null);
  const [config, setConfig] = useState(SAMPLE_CONFIG);
  const [csv, setCsv] = useState(SAMPLE_CSV);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [iso, setIso] = useState<any>(null);
  const [isoBusy, setIsoBusy] = useState(false);

  if (!me.platform_admin) return <Empty icon="lock" title="Platform admins only" body="Adding a campus changes who can sign in, so only Passport platform admins can do it." />;
  if (error) return <Empty icon="info" title="Could not load" body={error} />;
  if (!data) return <Skeleton h={300} />;

  const submit = async (dry_run: boolean) => {
    setBusy(true); setErr(null);
    try {
      const r = await api('/admin/campuses', { body: { config, courses_csv: csv, dry_run } });
      setResult({ ...r, dry_run });
      if (r.ok && !dry_run) { reload(); refreshAll(); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const runIsolation = async () => {
    setIsoBusy(true); setIso(null);
    try { setIso(await api('/admin/isolation')); } catch (e: any) { setIso({ error: e.message }); } finally { setIsoBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Campuses" sub="Each campus is one config file and one course list. No code changes." back={() => nav(-1)} />

      <div className="form-2col">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="text-[18px] mb-1">Add a campus</h2>
            <p className="text-[14px] text-ink-soft font-bold">Paste or load the campus config and its course CSV. Check first, then add. Students with a matching .edu email can sign in right away.</p>

            <div className="flex items-center justify-between mt-4 mb-2">
              <label className="label" htmlFor="cfg">Config JSON</label>
              <FilePick label="Load .json" accept=".json,application/json" onText={setConfig} />
            </div>
            <textarea id="cfg" className="input font-mono !text-[12px] leading-snug !min-h-[300px]" spellCheck={false} value={config} onChange={(e) => { setConfig(e.target.value); setResult(null); }} />
            <p className="text-[12px] text-ink-soft font-bold mt-1">Needs slug, name, short, .edu domains, city, safe zones with coordinates, and housing. Walk times and the map are worked out from coordinates when left out. The sample coordinates are approximate.</p>

            <div className="flex items-center justify-between mt-4 mb-2">
              <label className="label" htmlFor="csv">Course CSV</label>
              <FilePick label="Load .csv" accept=".csv,text/csv" onText={setCsv} />
            </div>
            <textarea id="csv" className="input font-mono !text-[12px] leading-snug !min-h-[150px]" spellCheck={false} value={csv} onChange={(e) => { setCsv(e.target.value); setResult(null); }} />
            <p className="text-[12px] text-ink-soft font-bold mt-1">Header: {data.csv_header}. Books are matched by ISBN; a new ISBN needs a book_title.</p>

            <ErrorNote>{err}</ErrorNote>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button className="btn-secondary" disabled={busy} onClick={() => submit(true)}>Check</button>
              <button className="btn-primary !min-h-[46px] whitespace-nowrap" disabled={busy || !result?.ok || !result?.dry_run} onClick={() => submit(false)}>Add campus</button>
            </div>
          </section>

          {result && (
            <section className="card p-5">
              {result.ok && !result.dry_run ? (
                <p className="font-extrabold text-sage-deep flex gap-2"><Icon name="check" className="shrink-0" />{result.preview.short} is live. Anyone with @{result.preview.domains.join(' or @')} can sign in, and {result.preview.admin_email} is its demo admin.</p>
              ) : result.ok ? (
                <p className="font-extrabold text-sage-deep flex gap-2"><Icon name="check" className="shrink-0" />Looks good. Nothing is saved until you press Add campus.</p>
              ) : (
                <>
                  <h3 className="font-extrabold">Fix {plural(result.errors.length, 'thing')} first</h3>
                  <ul className="mt-2 space-y-1 text-[14px] font-bold text-error">{result.errors.map((e: string) => <li key={e}>{e}</li>)}</ul>
                </>
              )}
              {result.preview && (
                <div className="mt-3">
                  <Row label="Campus" value={`${result.preview.name} (${result.preview.short}), ${result.preview.city}`} />
                  <Row label="Sign-in domains" value={result.preview.domains.join(', ')} />
                  <Row label="Safe zones" value={result.preview.safe_zones.join(', ')} />
                  <Row label="Housing" value={result.preview.housing.join(', ')} />
                  <Row label="Courses" value={`${plural(result.preview.courses, 'course')}, ${plural(result.preview.books_matched, 'known book')}, ${plural(result.preview.books_new, 'new book')}`} />
                </div>
              )}
              {result.filled?.length > 0 && <p className="text-[13px] text-ink-soft font-bold mt-3">Filled in for you: {result.filled.join('; ')}.</p>}
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section>
            <h2 className="label mb-3">Live campuses</h2>
            <div className="space-y-3">
              {data.campuses.map((c: any) => (
                <div key={c.slug} className="card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-extrabold">{c.name}</div>
                    <Chip tone="plain">{c.short}</Chip>
                  </div>
                  <div className="text-[13px] text-ink-soft font-bold mt-1">{c.city}, @{c.domains.join(' @')}</div>
                  <div className="text-[13px] text-ink-soft font-bold">{plural(c.users, 'student')}, {plural(c.listings, 'listing')}, {plural(c.courses, 'course')}, {plural(c.safe_zones, 'safe zone')}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-[18px] mb-1">Isolation check</h2>
            <p className="text-[14px] text-ink-soft font-bold">Signs in as a UAB student and tries to read and act on UA-only listings, needs, trades and messages, including by guessed IDs. Every attempt should fail.</p>
            <button className="btn-secondary w-full mt-4" disabled={isoBusy} onClick={runIsolation}>{isoBusy ? 'Running...' : 'Run isolation check'}</button>
            {iso?.error && <ErrorNote>{iso.error}</ErrorNote>}
            {iso?.checks && (
              <>
                <p className={`font-extrabold mt-4 ${iso.passed === iso.total ? 'text-sage-deep' : 'text-error'}`}>{iso.passed} of {iso.total} checks passed</p>
                <ul className="mt-2 space-y-1.5 text-[13px] font-bold">
                  {iso.checks.map((c: any) => (
                    <li key={c.name} className="flex gap-2">
                      <Icon name={c.ok ? 'check' : 'info'} size={16} className={`shrink-0 mt-0.5 ${c.ok ? 'text-sage-deep' : 'text-error'}`} />
                      <span>{c.name}<span className="text-ink-soft"> ({c.detail})</span></span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
