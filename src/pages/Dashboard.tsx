import { useEffect, useMemo, useRef, useState } from 'react';
import { api, brl, getConfig, storage } from '../api';

// Painel de análise do funil. Cores por função (ver dataviz): série única em azul; 3 séries diárias nas
// cores categóricas 1–3 em ordem fixa; status sempre com ícone + texto.

type Item = { key: string; label: string; value: number; text?: string };
type Day = { day: string; visits: number; started: number; completed: number; checkouts: number; purchases: number; revenueCents: number; leads: number; interested: number };
type Data = {
  mode: 'free' | 'paid';
  ad_spend?: { cents: number; updated_at: string | null; campaigns: { id: string; name: string; cents: number }[] };
  leads: { total: number; interested: number; publicNameOk: number };
  range: { from: string; to: string };
  funnel: Item[];
  questions: Item[];
  quiz: { sessions: number; started: number; medianMinutesToResult: number | null };
  daily: Day[];
  orders: { created: number; pixGenerated: number; paid: number; expired: number; refunded: number; medianMinutesToPay: number | null };
  revenue: { grossCents: number; netCents: number; purchases: number };
  sources: { source: string; adset: string; sessions: number; started: number; completed: number; orders: number; paid: number; leads: number; interested: number; revenueCents: number }[];
  profile: {
    moments: { key: string; c: number }[];
    dailyTime: { key: string; c: number }[];
    preferences: { key: string; c: number }[];
    topCareer: { key: string; c: number; paid: number; leads: number; interested: number }[];
    broad: number;
  };
  delivery: { entitlements: number; accessed: number; plan_started: number; plan_done: number; avg_days: number; decisions: { key: string; c: number }[] };
  consent: { key: string; c: number }[];
};

const ROAS_GOAL = 1.8;
const MOMENT: Record<string, string> = { first: 'Primeira área', change: 'Mudar de área', explore: 'Explorar sem sair' };
const DECISION: Record<string, string> = { explore_more: 'Quero explorar mais', know_better: 'Preciso conhecer melhor', try_other: 'Prefiro testar outra opção' };
const SERIES = [
  { key: 'visits', label: 'Visitas', color: 'var(--series-1)' },
  { key: 'started', label: 'Começaram', color: 'var(--series-2)' },
  { key: 'completed', label: 'Terminaram', color: 'var(--series-3)' },
] as const;

const pct = (a: number, b: number) => (b > 0 ? a / b : null);
const fmtPct = (v: number | null, digits = 1) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`);
const fmtInt = (v: number) => v.toLocaleString('pt-BR');
const fmtMin = (v: number | null) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} s` : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`);
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function localToday(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

const PRESETS = [
  { id: 'today', label: 'Hoje', range: () => [localToday(), localToday()] },
  { id: 'yesterday', label: 'Ontem', range: () => [localToday(-1), localToday(-1)] },
  { id: '7d', label: '7 dias', range: () => [localToday(-6), localToday()] },
  { id: '30d', label: '30 dias', range: () => [localToday(-29), localToday()] },
] as const;

/** Largura real do contêiner, para o SVG desenhar em pixels de tela (texto não estica). */
function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

/** Tooltip compartilhado: posicionado dentro do contêiner do gráfico. */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const show = (e: React.PointerEvent, lines: string[]) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
  };
  const el = tip && (
    <div className="viz-tip" role="status" style={{ left: Math.min(tip.x + 12, (ref.current?.clientWidth ?? 300) - 220), top: tip.y + 12 }}>
      {tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'viz-tip-title' : ''}>{l}</div>)}
    </div>
  );
  return { ref, show, hide: () => setTip(null), el };
}

function Tile({ label, value, sub, status }: { label: string; value: string; sub?: string; status?: 'good' | 'bad' | null }) {
  return (
    <div className="viz-tile">
      <div className="viz-tile-label">{label}</div>
      <div className="viz-tile-value">{value}</div>
      {sub && <div className="viz-tile-sub">{sub}</div>}
      {status && (
        <div className={`viz-status ${status}`}>
          {status === 'good'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01" /></svg>}
          {status === 'good' ? 'Dentro da meta' : 'Fora da meta'}
        </div>
      )}
    </div>
  );
}

/** Funil: barras horizontais de uma série; rótulo direto com valor e % da etapa anterior. */
function Funnel({ items }: { items: Item[] }) {
  const tip = useTip();
  const max = Math.max(1, items[0]?.value ?? 1);
  let worst = -1;
  let worstRate = 2;
  items.forEach((it, i) => {
    if (i === 0) return;
    const r = pct(it.value, items[i - 1].value);
    if (r != null && items[i - 1].value > 0 && r < worstRate) {
      worstRate = r;
      worst = i;
    }
  });
  return (
    <div className="viz-chart" ref={tip.ref}>
      {items.map((it, i) => {
        const prev = i > 0 ? items[i - 1].value : null;
        const step = prev != null ? pct(it.value, prev) : null;
        return (
          <div key={it.key} className="viz-funnel-row" onPointerMove={(e) => tip.show(e, [it.label, `${fmtInt(it.value)} pessoas`, i ? `${fmtPct(step)} da etapa anterior` : 'Etapa inicial', `${fmtPct(pct(it.value, items[0].value))} das visitas`])} onPointerLeave={tip.hide}>
            <div className="viz-funnel-label">{it.label}</div>
            <div className="viz-funnel-track">
              <div className="viz-funnel-bar" style={{ width: `${Math.max(it.value > 0 ? 1.5 : 0, (it.value / max) * 100)}%` }} />
            </div>
            <div className="viz-funnel-value">
              <strong>{fmtInt(it.value)}</strong>
              {i > 0 && <span> · {fmtPct(step, 0)}</span>}
              {i === worst && <span className="viz-flag">maior queda</span>}
            </div>
          </div>
        );
      })}
      {tip.el}
    </div>
  );
}

/** Abandono por pergunta: colunas da % de quem começou que chegou a cada etapa. */
function QuestionDrop({ items, started }: { items: Item[]; started: number }) {
  const tip = useTip();
  const size = useWidth();
  const H = 180;
  const W = size.w;
  const bw = W / items.length;
  let worst = -1;
  let worstLoss = 0;
  items.forEach((it, i) => {
    const prev = i === 0 ? started : items[i - 1].value;
    if (prev - it.value > worstLoss) {
      worstLoss = prev - it.value;
      worst = i;
    }
  });
  return (
    <div className="viz-chart" ref={tip.ref}>
      <div ref={size.ref}>
      <svg viewBox={`0 0 ${W} ${H + 40}`} width={W} height={H + 40} className="viz-svg" role="img" aria-label="Pessoas que chegaram a cada pergunta">
        {[0, 0.5, 1].map((g) => (
          <g key={g}>
            <line x1="0" x2={W} y1={H - g * H} y2={H - g * H} className={g === 0 ? 'viz-axis' : 'viz-grid'} />
            <text x="2" y={H - g * H - 4} className="viz-tick">{g * 100}%</text>
          </g>
        ))}
        {items.map((it, i) => {
          const r = started > 0 ? it.value / started : 0;
          const h = Math.max(it.value > 0 ? 2 : 0, r * (H - 16));
          const prev = i === 0 ? started : items[i - 1].value;
          return (
            <g key={it.key}
              onPointerMove={(e) => tip.show(e, [it.text ?? it.label, `${fmtInt(it.value)} de ${fmtInt(started)} que começaram (${fmtPct(r, 0)})`, `Saíram nesta etapa: ${fmtInt(Math.max(0, prev - it.value))}`])}
              onPointerLeave={tip.hide}>
              <rect x={i * bw} y="0" width={bw} height={H + 40} fill="transparent" />
              <path d={`M${i * bw + 3},${H} v${-(h - 4)} q0,-4 4,-4 h${bw - 14} q4,0 4,4 v${h - 4} z`} className={i === worst ? 'viz-bar viz-bar-hl' : 'viz-bar'} />
              <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" className="viz-tick">{bw < 34 && it.label.length > 3 ? it.label.slice(0, 3) : it.label}</text>
              {(i === worst || i === items.length - 1) && <text x={i * bw + bw / 2} y={H - h - 6} textAnchor="middle" className="viz-val">{fmtPct(r, 0)}</text>}
            </g>
          );
        })}
      </svg>
      </div>
      {worst >= 0 && worstLoss > 0 && (
        <p className="viz-note">Maior saída: <strong>{items[worst].label}</strong> — {items[worst].text} ({fmtInt(worstLoss)} pessoas).</p>
      )}
      {tip.el}
    </div>
  );
}

/** Série diária: 3 linhas na mesma escala (pessoas), crosshair com tooltip, legenda + rótulo no fim. */
function DailyLines({ days, free }: { days: Day[]; free: boolean }) {
  const tip = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const size = useWidth();
  const W = size.w;
  const H = 220;
  const padL = 34;
  const padR = 84;
  const max = Math.max(1, ...days.flatMap((d) => [d.visits, d.started, d.completed]));
  const x = (i: number) => padL + (days.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (days.length - 1));
  const y = (v: number) => H - (v / max) * (H - 12);
  const ticks = [0, Math.round(max / 2), max];
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(days.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (days.length - 1))));
    setHover(i);
    const d = days[i];
    tip.show(e, [fmtDay(d.day), ...SERIES.map((s) => `${s.label}: ${fmtInt(d[s.key])}`), free ? `Leads: ${fmtInt(d.leads)} · interesse: ${fmtInt(d.interested)}` : `Compras: ${fmtInt(d.purchases)} · ${brl(d.revenueCents)}`]);
  };
  return (
    <div className="viz-chart" ref={tip.ref}>
      <div className="viz-legend">
        {SERIES.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div ref={size.ref}>
      <svg viewBox={`0 0 ${W} ${H + 28}`} width={W} height={H + 28} className="viz-svg" role="img" aria-label="Visitas, inícios e conclusões por dia">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'viz-axis' : 'viz-grid'} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="viz-tick">{fmtInt(t)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % Math.max(1, Math.ceil(days.length / Math.floor((W - padL - padR) / 56))) === 0 || i === days.length - 1) && (
          <text key={d.day} x={x(i)} y={H + 18} textAnchor="middle" className="viz-tick">{fmtDay(d.day)}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} className="viz-cross" />}
        {SERIES.map((s) => {
          const pts = days.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ');
          const last = days[days.length - 1];
          return (
            <g key={s.key}>
              {days.length > 1 && <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
              {(days.length === 1 || hover != null) && days.map((d, i) => (days.length === 1 || i === hover) && (
                <circle key={i} cx={x(i)} cy={y(d[s.key])} r="4.5" fill={s.color} stroke="var(--surface-1)" strokeWidth="2" />
              ))}
              {last && <text x={x(days.length - 1) + 8} y={y(last[s.key]) + 4} className="viz-end">{s.label} {fmtInt(last[s.key])}</text>}
            </g>
          );
        })}
        <rect x={padL} y="0" width={W - padL - padR} height={H} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => { setHover(null); tip.hide(); }} />
      </svg>
      </div>
      {tip.el}
    </div>
  );
}

function BarList({ rows, total, extra }: { rows: { label: string; value: number; extra?: string }[]; total: number; extra?: string }) {
  const tip = useTip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="small muted">Sem dados no período.</p>;
  return (
    <div className="viz-chart" ref={tip.ref}>
      {rows.map((r) => (
        <div key={r.label} className="viz-barlist-row" onPointerMove={(e) => tip.show(e, [r.label, `${fmtInt(r.value)} (${fmtPct(pct(r.value, total), 0)} do total)`, ...(r.extra ? [r.extra] : [])])} onPointerLeave={tip.hide}>
          <div className="viz-barlist-top"><span>{r.label}</span><span><strong>{fmtInt(r.value)}</strong> · {fmtPct(pct(r.value, total), 0)}{r.extra && extra ? ` · ${r.extra}` : ''}</span></div>
          <div className="viz-funnel-track"><div className="viz-funnel-bar" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
      {tip.el}
    </div>
  );
}

const shortCampaign = (name: string) => (/vendas/i.test(name) ? 'Vendas' : /lead/i.test(name) ? 'Leads' : name.split('|')[0].trim() || 'Campanha');
const fmtUpdated = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function Dashboard() {
  const [preset, setPreset] = useState<string>(storage.get('mc_dash_preset') ?? '7d');
  // Já começa no período salvo: sem uma primeira consulta de "7 dias" correndo junto com a de "hoje".
  const initial = (PRESETS.find((x) => x.id === preset)?.range() ?? [localToday(-6), localToday()]) as [string, string];
  const [from, setFrom] = useState(initial[0]);
  const [to, setTo] = useState(initial[1]);
  // Gasto vem da Meta (enviado a cada 3 h); o campo manual só vale se for preenchido.
  const [spendText, setSpendText] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  // Meta de custo por compra = preço do produto vendido ÷ ROAS alvo (preço lido do servidor).
  const [priceCents, setPriceCents] = useState(1790);
  useEffect(() => void getConfig().then((c) => setPriceCents(c.offer_mode === 'free' ? (c.diagnostic_price_cents ?? 1790) : c.price_cents)).catch(() => undefined), []);
  const CPA_GOAL = priceCents / 100 / ROAS_GOAL;

  useEffect(() => {
    const p = PRESETS.find((x) => x.id === preset);
    if (p) {
      const [f, t] = p.range();
      setFrom(f);
      setTo(t);
    }
    storage.set('mc_dash_preset', preset);
  }, [preset]);

  useEffect(() => {
    // Só a resposta do período escolhido por último vale: respostas antigas que chegam depois são descartadas.
    let current = true;
    setError(null);
    setData(null);
    api<Data>('GET', `/api/admin/analytics?from=${from}&to=${to}`)
      .then((d) => { if (current && d.range.from === from && d.range.to === to) setData(d); })
      .catch((e) => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [from, to]);

  const manualSpend = Number(spendText.replace(/\./g, '').replace(',', '.')) || 0;
  const autoSpend = (data?.ad_spend?.cents ?? 0) / 100;
  const spend = manualSpend > 0 ? manualSpend : autoSpend;

  const k = useMemo(() => {
    if (!data) return null;
    const f = Object.fromEntries(data.funnel.map((x) => [x.key, x.value]));
    const revenue = data.revenue.grossCents / 100;
    const roas = spend > 0 ? revenue / spend : null;
    const cpa = spend > 0 && data.revenue.purchases > 0 ? spend / data.revenue.purchases : null;
    const cpv = spend > 0 && f.visits > 0 ? spend / f.visits : null;
    return { f, revenue, roas, cpa, cpv, neededConv: cpv != null ? cpv / CPA_GOAL : null, conv: pct(f.paid, f.visits) };
  }, [data, spend, CPA_GOAL]);

  const insights = useMemo(() => {
    if (!data || !k) return [];
    const out: string[] = [];
    const steps = data.funnel.slice(1).map((it, i) => ({ it, prev: data.funnel[i], r: pct(it.value, data.funnel[i].value) }));
    const worst = steps.filter((s) => s.prev.value >= 5 && s.r != null).sort((a, b) => a.r! - b.r!)[0];
    if (worst) out.push(`Maior gargalo do funil: de “${worst.prev.label}” para “${worst.it.label}” passam só ${fmtPct(worst.r, 0)}.`);
    if (data.mode === 'free') {
      if (data.leads.total > 0) out.push(`${fmtPct(pct(data.leads.interested, data.leads.total), 0)} dos leads clicaram na oferta do roteiro: este é o principal sinal de demanda para a versão paga.`);
      if (k.f.completed > 0) out.push(`${fmtPct(pct(data.leads.total, k.f.completed), 0)} de quem terminou o teste deixou nome e WhatsApp.`);
    }
    if (data.mode === 'paid' && k.neededConv != null && k.conv != null) {
      out.push(k.conv >= k.neededConv
        ? `Conversão visita→compra de ${fmtPct(k.conv)} supera os ${fmtPct(k.neededConv)} necessários para ROAS ${ROAS_GOAL} ao custo atual por visita (${brl(Math.round(k.cpv! * 100))}).`
        : `Para ROAS ${ROAS_GOAL} com custo por visita de ${brl(Math.round(k.cpv! * 100))}, a conversão visita→compra precisa ser ${fmtPct(k.neededConv)}; hoje está em ${fmtPct(k.conv)}.`);
    }
    const pixRate = pct(data.orders.paid, data.orders.pixGenerated);
    if (data.orders.pixGenerated >= 3 && pixRate != null) out.push(`${fmtPct(pixRate, 0)} de quem gerou o Pix pagou${data.orders.medianMinutesToPay != null ? `, em ${fmtMin(data.orders.medianMinutesToPay)} (mediana)` : ''}.`);
    const goal = (x: Data['sources'][number]) => (data.mode === 'free' ? x.interested : x.paid);
    const bestAd = data.sources.filter((s) => s.sessions >= 5 && s.source !== '(sem UTM / direto)').sort((a, b) => (goal(b) / b.sessions) - (goal(a) / a.sessions) || (b.completed / b.sessions) - (a.completed / a.sessions))[0];
    if (bestAd) out.push(`Melhor anúncio: “${bestAd.source}” — ${fmtPct(pct(bestAd.completed, bestAd.sessions), 0)} terminam o teste e ${fmtPct(pct(goal(bestAd), bestAd.sessions))} ${data.mode === 'free' ? 'clicam na oferta' : 'compram'}.`);
    const granted = data.consent.find((c) => c.key === 'granted')?.c ?? 0;
    const allConsent = data.consent.reduce((s, c) => s + c.c, 0);
    if (allConsent >= 10) out.push(`${fmtPct(pct(granted, allConsent), 0)} das visitas aceitaram cookies; só essas aparecem no Pixel da Meta.`);
    if (data.profile.broad > 0) out.push(`${fmtInt(data.profile.broad)} resultado(s) com perfil amplo (respostas pouco diferenciadas).`);
    return out;
  }, [data, k]);

  return (
    <div className="viz-root">
      <div className="viz-toolbar">
        <div className="viz-presets" role="group" aria-label="Período">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>{p.label}</button>
          ))}
        </div>
        <label className="viz-field">De<input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setFrom(e.target.value); }} /></label>
        <label className="viz-field">Até<input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setTo(e.target.value); }} /></label>
        <label className="viz-field">Investimento no período (R$)<input type="text" inputMode="decimal" placeholder={autoSpend > 0 ? autoSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + ' (Meta)' : 'ex.: 98,00'} value={spendText} onChange={(e) => setSpendText(e.target.value)} /></label>
      </div>

      {error && <div className="status error">{error}</div>}
      <p className="small muted" style={{ margin: '4px 0 10px' }}>
        Mostrando: <strong>{from === to ? fmtDay(from) : `${fmtDay(from)} a ${fmtDay(to)}`}</strong>
        {from === to && from === localToday() ? ' (hoje, desde 00:00 de Brasília)' : ''}
      </p>
      {data && (
        <div className="viz-spend small">
          {manualSpend > 0 ? <>Usando o investimento digitado: <strong>{brl(Math.round(manualSpend * 100))}</strong></>
            : data.ad_spend && data.ad_spend.cents > 0 ? (
              <>Gasto na Meta no período: <strong>{brl(data.ad_spend.cents)}</strong>
                {data.ad_spend.campaigns.length > 1 && <> ({data.ad_spend.campaigns.map((c) => `${shortCampaign(c.name)} ${brl(c.cents)}`).join(' · ')})</>}
                {data.ad_spend.updated_at && <span className="muted"> · atualizado {fmtUpdated(data.ad_spend.updated_at)}</span>}</>
            ) : <span className="muted">Gasto na Meta ainda não enviado para este período.</span>}
        </div>
      )}
      {!data || !k ? <div className="spinner dark" aria-label="Carregando" /> : (
        <>
          <div className="viz-tiles">
            <Tile label="Visitas" value={fmtInt(k.f.visits)} sub={k.cpv != null ? `${brl(Math.round(k.cpv * 100))} por visita` : 'página inicial'} />
            <Tile label="Começaram o teste" value={fmtInt(k.f.started)} sub={`${fmtPct(pct(k.f.started, k.f.visits), 0)} das visitas`} />
            <Tile label="Terminaram o teste" value={fmtInt(k.f.completed)} sub={`${fmtPct(pct(k.f.completed, k.f.started), 0)} de quem começou · ${fmtMin(data.quiz.medianMinutesToResult)}`} />
            {data.mode === 'free' ? (
              <>
                <Tile label="Leads (nome + WhatsApp)" value={fmtInt(data.leads.total)} sub={`${fmtPct(pct(data.leads.total, k.f.completed), 0)} de quem terminou`} />
                <Tile label="Clicaram na oferta" value={fmtInt(data.leads.interested)} sub={`${fmtPct(pct(data.leads.interested, data.leads.total), 0)} dos leads`} />
                <Tile label="Custo por lead" value={spend > 0 && data.leads.total ? brl(Math.round((spend / data.leads.total) * 100)) : '—'} sub={spend > 0 ? undefined : 'informe o investimento'} />
                <Tile label="Custo por interessado" value={spend > 0 && data.leads.interested ? brl(Math.round((spend / data.leads.interested) * 100)) : '—'} sub="sinal de demanda" />
                <Tile label="Pix gerados" value={fmtInt(k.f.pix)} sub={`${fmtPct(pct(k.f.pix, data.leads.total), 0)} dos leads${k.f.pix > k.f.paid ? ` · ${fmtInt(k.f.pix - k.f.paid)} sem pagar` : ''}`} />
                <Tile label="Pix pagos" value={fmtInt(k.f.paid)} sub={k.f.pix ? `${fmtPct(pct(k.f.paid, k.f.pix), 0)} dos Pix · ${brl(data.revenue.grossCents)}` : brl(data.revenue.grossCents)} status={k.f.paid > 0 ? 'good' : null} />
                <Tile label="ROAS" value={k.roas != null ? k.roas.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'} sub={spend > 0 ? `meta ${ROAS_GOAL}` : 'informe o investimento'} status={k.roas != null ? (k.roas >= ROAS_GOAL ? 'good' : 'bad') : null} />
                <Tile label="Custo por compra" value={k.cpa != null ? brl(Math.round(k.cpa * 100)) : '—'} sub={`meta até ${brl(Math.floor(CPA_GOAL * 100))}`} status={k.cpa != null ? (k.cpa <= CPA_GOAL ? 'good' : 'bad') : null} />
              </>
            ) : (
              <>
                <Tile label="Compras" value={fmtInt(data.revenue.purchases)} sub={`${fmtPct(k.conv)} das visitas`} />
                <Tile label="Receita" value={brl(data.revenue.grossCents)} sub={data.orders.refunded ? `${data.orders.refunded} reembolso(s) · líquida ${brl(data.revenue.netCents)}` : 'bruta'} />
                <Tile label="ROAS" value={k.roas != null ? k.roas.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '—'} sub={spend > 0 ? `meta ${ROAS_GOAL}` : 'informe o investimento'} status={k.roas != null ? (k.roas >= ROAS_GOAL ? 'good' : 'bad') : null} />
                <Tile label="Custo por compra" value={k.cpa != null ? brl(Math.round(k.cpa * 100)) : '—'} sub={`meta até ${brl(Math.floor(CPA_GOAL * 100))}`} status={k.cpa != null ? (k.cpa <= CPA_GOAL ? 'good' : 'bad') : null} />
              </>
            )}
          </div>

          {insights.length > 0 && (
            <section className="viz-card">
              <h3>Leituras do período</h3>
              <ul className="viz-insights">{insights.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}

          <div className="viz-grid-2">
            <section className="viz-card">
              <h3>Funil completo</h3>
              <p className="viz-sub">Pessoas em cada etapa · % da etapa anterior</p>
              <Funnel items={data.funnel} />
            </section>
            <section className="viz-card">
              <h3>Onde desistem no teste</h3>
              <p className="viz-sub">% de quem começou que chegou a cada pergunta ({fmtInt(data.quiz.started)} começaram)</p>
              <QuestionDrop items={data.questions} started={data.quiz.started} />
            </section>
          </div>

          <section className="viz-card">
            <div className="viz-card-head">
              <div>
                <h3>Por dia</h3>
                <p className="viz-sub">Visitas, inícios e conclusões do teste (pessoas)</p>
              </div>
              <button type="button" className="btn link" onClick={() => setShowTable((v) => !v)}>{showTable ? 'Ver gráfico' : 'Ver tabela'}</button>
            </div>
            {showTable ? (
              <div className="viz-table-wrap">
                <table className="admin">
                  <thead><tr><th>Dia</th><th>Visitas</th><th>Começaram</th><th>Terminaram</th><th>Pix</th><th>Compras</th><th>Receita</th></tr></thead>
                  <tbody>{data.daily.map((d) => (
                    <tr key={d.day}><td>{fmtDay(d.day)}</td><td>{d.visits}</td><td>{d.started}</td><td>{d.completed}</td><td>{d.checkouts}</td><td>{d.purchases}</td><td>{brl(d.revenueCents)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <DailyLines days={data.daily} free={data.mode === 'free'} />}
          </section>

          <section className="viz-card">
            <h3>Por anúncio / origem</h3>
            <p className="viz-sub">Agrupado pela UTM do anúncio (utm_content). Sessões = quem abriu o teste.</p>
            <div className="viz-table-wrap">
              <table className="admin">
                <thead><tr><th>Origem</th><th>Conjunto</th><th>Sessões</th><th>Começaram</th><th>Terminaram</th>{data.mode === 'free'
                  ? <><th>Leads</th><th>Interesse</th><th>Conv. lead</th><th>Conv. interesse</th></>
                  : <><th>Pix</th><th>Compras</th><th>Conv.</th><th>Receita</th></>}</tr></thead>
                <tbody>
                  {data.sources.length === 0 && <tr><td colSpan={9} className="muted">Sem sessões no período.</td></tr>}
                  {data.sources.map((s) => (
                    <tr key={s.source + s.adset}>
                      <td>{s.source}</td><td>{s.adset || '—'}</td><td>{s.sessions}</td>
                      <td>{fmtPct(pct(s.started, s.sessions), 0)}</td><td>{fmtPct(pct(s.completed, s.sessions), 0)}</td>
                      {data.mode === 'free'
                        ? <><td>{s.leads}</td><td>{s.interested}</td><td>{fmtPct(pct(s.leads, s.sessions))}</td><td>{fmtPct(pct(s.interested, s.sessions))}</td></>
                        : <><td>{s.orders}</td><td>{s.paid}</td><td>{fmtPct(pct(s.paid, s.sessions))}</td><td>{brl(s.revenueCents)}</td></>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="viz-grid-2">
            {data.mode === 'paid' ? <section className="viz-card">
              <h3>Pagamento</h3>
              <div className="viz-tiles small">
                <Tile label="Pix gerados" value={fmtInt(data.orders.pixGenerated)} />
                <Tile label="Pagos" value={fmtInt(data.orders.paid)} sub={`${fmtPct(pct(data.orders.paid, data.orders.pixGenerated), 0)} dos Pix`} />
                <Tile label="Expirados" value={fmtInt(data.orders.expired)} sub="sem pagamento" />
                <Tile label="Tempo até pagar" value={fmtMin(data.orders.medianMinutesToPay)} sub="mediana" />
              </div>
            </section> : <section className="viz-card">
              <h3>Contatos</h3>
              <div className="viz-tiles small">
                <Tile label="Leads" value={fmtInt(data.leads.total)} />
                <Tile label="Clicaram na oferta" value={fmtInt(data.leads.interested)} sub={fmtPct(pct(data.leads.interested, data.leads.total), 0)} />
                <Tile label="Autorizaram nome nas notificações" value={fmtInt(data.leads.publicNameOk)} sub={fmtPct(pct(data.leads.publicNameOk, data.leads.total), 0)} />
              </div>
            </section>}
            <section className="viz-card">
              <h3>{data.mode === 'free' ? 'Uso do mapa' : 'Uso do mapa pago'}</h3>
              <div className="viz-tiles small">
                <Tile label="Abriram o mapa" value={fmtInt(data.delivery.accessed)} sub={`${fmtPct(pct(data.delivery.accessed, data.delivery.entitlements), 0)} ${data.mode === 'free' ? 'dos leads' : 'dos compradores'}`} />
                <Tile label="Começaram o plano" value={fmtInt(data.delivery.plan_started)} sub={`${fmtPct(pct(data.delivery.plan_started, data.delivery.entitlements), 0)}`} />
                <Tile label="Fizeram os 7 dias" value={fmtInt(data.delivery.plan_done)} />
                <Tile label="Dias marcados" value={data.delivery.avg_days.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} sub={data.mode === 'free' ? 'média por lead' : 'média por comprador'} />
              </div>
              {data.delivery.decisions.length > 0 && (
                <BarList rows={data.delivery.decisions.map((d) => ({ label: DECISION[d.key] ?? d.key, value: d.c }))} total={data.delivery.decisions.reduce((s, d) => s + d.c, 0)} />
              )}
            </section>
          </div>

          <div className="viz-grid-2">
            <section className="viz-card">
              <h3>Quem faz o teste</h3>
              <p className="viz-sub">Momento de carreira</p>
              <BarList rows={data.profile.moments.map((m) => ({ label: MOMENT[m.key] ?? m.key, value: m.c }))} total={data.profile.moments.reduce((s, m) => s + m.c, 0)} />
              <p className="viz-sub" style={{ marginTop: 16 }}>Tempo por dia</p>
              <BarList rows={data.profile.dailyTime.map((m) => ({ label: m.key === '(sem)' ? m.key : `${m.key} min`, value: m.c }))} total={data.profile.dailyTime.reduce((s, m) => s + m.c, 0)} />
            </section>
            <section className="viz-card">
              <h3>Resultados</h3>
              <p className="viz-sub">1º caminho sugerido · {data.mode === 'free' ? 'cliques na oferta' : 'compras'} de quem recebeu</p>
              <BarList extra="paid" rows={data.profile.topCareer.map((c) => ({ label: c.key, value: c.c, extra: data.mode === 'free' ? `${c.interested} interesse(s)` : `${c.paid} compra(s)` }))} total={data.profile.topCareer.reduce((s, c) => s + c.c, 0)} />
              <p className="viz-sub" style={{ marginTop: 16 }}>Duas preferências mais fortes</p>
              <BarList rows={data.profile.preferences.map((c) => ({ label: c.key, value: c.c }))} total={data.profile.preferences.reduce((s, c) => s + c.c, 0)} />
            </section>
          </div>
          <p className="small muted">Visitas = carregamentos da página inicial. Pessoas por etapa contam sessões do teste. Fuso de Brasília.</p>
        </>
      )}
    </div>
  );
}
