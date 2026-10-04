// Oferta do Roteiro para começar: a pessoa escolhe o caminho e vê uma amostra real antes de pagar.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, brl } from '../api';
import { track } from '../analytics';
import { CheckIcon, LockIcon, SparkIcon } from './Icons';

type Card = { careerId: string; name: string; attention: string; tension?: string | null; dim?: string; match?: number };
type Ctx = { moment?: string; dailyTime?: number; currentArea?: string };

const WANTS = [
  { value: 'roteiro', label: 'Um roteiro passo a passo para entrar na área' },
  { value: 'cursos', label: 'Saber quais cursos valem a pena (e quais evitar)' },
  { value: 'vagas', label: 'Como conseguir as primeiras oportunidades' },
  { value: 'mentoria', label: 'Conversar com alguém que já trabalha na área' },
];
const PATH_SHORT = { livre: 'Dá para começar sem diploma', tecnico: 'Curso técnico ou livre', regulada: 'Exige formação ou registro' };

/** Linha que rola para o lado, com aviso claro de que há mais opções (seta animada + borda esmaecida). */
export function SwipeRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  const [moved, setMoved] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setOverflow(el.scrollWidth > el.clientWidth + 4);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
      if (el.scrollLeft > 8) setMoved(true);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
  }, []);
  return (
    <div className={`swipe${overflow && !atEnd ? ' more' : ''}`}>
      <div ref={ref} className="chips swipe-track" role="radiogroup" aria-label={label}>{children}</div>
      {overflow && !moved && (
        <button type="button" className="swipe-hint" onClick={() => ref.current?.scrollBy({ left: 160, behavior: 'smooth' })}>
          Deslize para ver os outros <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}

/** Barra fixa que convida a descer até o diagnóstico; some quando a oferta aparece na tela. */
export function ScrollNudge({ career, paid }: { career: string; paid: boolean }) {
  const [show, setShow] = useState(false);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = document.getElementById('diagnostico');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const t = setTimeout(() => setShow(true), 1500);
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setSeen(true);
      // Volta a aparecer só enquanto a oferta ainda está abaixo da tela.
      setShow(!e.isIntersecting && e.boundingClientRect.top > 0);
    }, { threshold: 0.15 });
    io.observe(el);
    return () => { clearTimeout(t); io.disconnect(); };
  }, []);
  if (!show || seen) return null;
  return (
    <button type="button" className="nudge no-print" onClick={() => document.getElementById('diagnostico')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
      <SparkIcon size={18} />
      <span>{paid ? <>Veja como começar em <strong>{career}</strong>: amostra grátis do roteiro</> : <>Veja o próximo passo para {career}</>}</span>
      <svg className="nudge-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

/** Barra de compra fixa: aparece só depois que a pessoa passou da oferta sem comprar. */
function BuyBar({ career, price, busy, onBuy }: { career: string; price: string; busy: boolean; onBuy: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById('diagnostico');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.toggle('has-buybar', show);
    return () => document.body.classList.remove('has-buybar');
  }, [show]);
  if (!show) return null;
  return (
    <div className="buybar no-print" role="region" aria-label="Comprar o roteiro">
      <span>Passo a passo para <strong>{career}</strong></span>
      <button type="button" className="btn" onClick={onBuy} disabled={busy}>{busy ? 'Gerando…' : `Quero · ${price}`}</button>
    </div>
  );
}

type Sample = {
  today: { activity: string; routine: string; requirement: string }; requirement: string; path: 'livre' | 'tecnico' | 'regulada';
  proof_teaser: string; tasks: number; first_jobs_count: number; course_terms_count?: number; checklist_count?: number;
};

export function DiagnosticOffer(props: {
  resultId: string; cards: Card[]; selectedId?: string | null; onSelect?: (careerId: string) => void; context: Ctx; firstName: string;
  interested: boolean; onInterested: () => void; detail?: { want?: string } | null;
  diagnostic?: { mode: 'waitlist' | 'paid'; price_cents: number; purchased: boolean; open_order_id: string | null };
}) {
  const { resultId, cards, context, interested, onInterested, diagnostic } = props;
  const [chosenId, setChosenId] = useState<string>(props.selectedId && cards.some((c) => c.careerId === props.selectedId) ? props.selectedId : cards[0].careerId);
  const first = cards.find((c) => c.careerId === chosenId) ?? cards[0];
  const [sample, setSample] = useState<Sample | null>(null);
  const nav = useNavigate();
  const paid = diagnostic?.mode === 'paid';
  const purchased = !!diagnostic?.purchased;
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ want?: string }>(props.detail ?? {});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSample(null);
    api<Sample>('GET', `/api/diagnostic/${resultId}/sample?career=${encodeURIComponent(first.careerId)}`)
      .then((r) => { if (live) setSample(r); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [resultId, first.careerId]);

  function pick(id: string) {
    setChosenId(id);
    props.onSelect?.(id);
  }
  const minutes = context.dailyTime ?? 15;
  const tasks = (minutes >= 60 ? 5 : minutes >= 30 ? 4 : 3) * 4;

  async function want() {
    setBusy(true);
    setError(null);
    try {
      const r = await api('POST', '/api/interest', { result_id: resultId });
      track('DiagnosticInterest', { eventId: r.event_id });
      onInterested();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      // Sinal de interesse continua valendo para medir a oferta (não bloqueia a compra).
      if (!interested) {
        const r = await api('POST', '/api/interest', { result_id: resultId }).catch(() => null);
        if (r) { track('DiagnosticInterest', { eventId: r.event_id }); onInterested(); }
      }
      const o = await api('POST', '/api/diagnostic/orders', { result_id: resultId });
      track('InitiateCheckout', { eventId: `ic_${o.order_id}`, value: o.amount_cents / 100 });
      nav(o.status === 'paid' ? `/diagnostico/${resultId}` : `/pagamento/${o.order_id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function answer(patch: { want?: string }) {
    const next = { ...detail, ...patch };
    setDetail(next);
    await api('POST', '/api/interest/details', { result_id: resultId, ...patch }).catch((e) => setError((e as Error).message));
  }

  const price = diagnostic ? brl(diagnostic.price_cents) : '';
  const shortPath = sample ? PATH_SHORT[sample.path] : null;
  return (
    <section id="diagnostico" className={`card diag${paid && !purchased ? ' diag-paid' : ''}`} aria-labelledby="diag-title">
      <div className="diag-head">
        <span className="kicker">{purchased ? 'Liberado para você' : '2 · Seu próximo passo'}</span>
        <h2 id="diag-title" className="diag-title">
          {purchased ? <>Seu roteiro para entrar em {first.name}</> : <>Baixe em PDF o seu plano passo a passo para entrar em <span>{first.name}</span></>}
        </h2>
        {!purchased && (
          <ul className="diag-bullets">
            <li><CheckIcon size={18} /><span><strong>Plano passo a passo</strong> de 4 semanas, com o que fazer em cada uma</span></li>
            <li><CheckIcon size={18} /><span><strong>Como estudar de graça</strong> desde já: onde e o que pesquisar</span></li>
            <li><CheckIcon size={18} /><span><strong>Qual curso fazer</strong> para começar na área (e quais evitar)</span></li>
            <li><CheckIcon size={18} /><span><strong>Seu primeiro projeto</strong> para mostrar em entrevistas</span></li>
            <li><CheckIcon size={18} /><span><strong>Onde buscar as primeiras vagas</strong>{sample ? ` (${sample.first_jobs_count} cargos para procurar)` : ''}</span></li>
          </ul>
        )}
      </div>

      {!purchased && cards.length > 1 && (
        <div className="diag-pick">
          <div className="diag-pick-label">Para qual caminho?</div>
          <SwipeRow label="Caminho do roteiro">
            {cards.map((c) => (
              <button key={c.careerId} type="button" role="radio" aria-checked={c.careerId === first.careerId} onClick={() => pick(c.careerId)}>
                {c.name}{c.match !== undefined ? ` · ${c.match}%` : ''}
              </button>
            ))}
          </SwipeRow>
        </div>
      )}


      {purchased ? (
        <button className="btn" onClick={() => nav(`/diagnostico/${resultId}`)}>Abrir e baixar meu roteiro</button>
      ) : paid ? (
        <div className="diag-buy">
          <p className="diag-anchor">Evite gastar com o curso errado.</p>
          <div className="diag-price">
            <strong>{price}</strong>
          </div>
          <button className="btn diag-cta" onClick={buy} disabled={busy}>
            {busy ? 'Gerando Pix…' : <>Quero baixar meu roteiro</>}
          </button>
          <ul className="diag-trust">
            <li><CheckIcon size={15} /> Pix, liberado na hora</li>
            <li><CheckIcon size={15} /> Garantia de 7 dias</li>
            <li><CheckIcon size={15} /> {sample?.tasks ?? tasks} tarefas</li>
          </ul>
          <BuyBar career={first.name} price={price} busy={busy} onBuy={buy} />
        </div>
      ) : !interested ? (
        <>
          <button className="btn" onClick={want} disabled={busy}>
            {busy ? 'Registrando…' : `Quero o passo a passo para ${first.name}`}
          </button>
          <p className="small muted" style={{ margin: '8px 0 0' }}>Sem compromisso e sem pagamento agora. Avisamos pelo WhatsApp.</p>
        </>
      ) : (
        <div className="diag-after">
          <div className="status ok" role="status"><CheckIcon size={20} className="diag-ok-icon" /><span>Você está na lista do Roteiro para começar em {first.name}. Avisamos pelo WhatsApp.</span></div>
          <div className="small" style={{ fontWeight: 700, margin: '14px 0 6px' }}>Para montarmos do jeito certo: o que mais te ajudaria agora?</div>
          <div className="chips" role="radiogroup" aria-label="O que mais te ajudaria">
            {WANTS.map((w) => (
              <button key={w.value} type="button" role="radio" aria-checked={detail.want === w.value} onClick={() => answer({ want: w.value })}>{w.label}</button>
            ))}
          </div>
          {detail.want && <p className="small muted" style={{ margin: '10px 0 0' }}>Obrigado! Isso nos ajuda a preparar o seu roteiro.</p>}
        </div>
      )}
      <div className="diag-steps-title">Como funciona, em 4 etapas</div>
      <ol className="diag-steps" aria-live="polite">
        <li className="open">
          <span className="diag-step-n">1</span>
          <span>
            <strong>Testar a rotina da área</strong>
            {sample ? <em className="ds-free"><b>Grátis, faça hoje:</b> {sample.today.activity.replace(/^Faça esta atividade:\s*/, '')}</em> : <em>antes de gastar com curso</em>}
          </span>
        </li>
        <li className={purchased ? '' : 'locked'}>
          <span className="diag-step-n">2</span>
          <span><strong>Escolher a formação certa</strong><em>{shortPath ?? 'o que a área exige'}</em></span>
          {!purchased && <LockIcon size={16} className="diag-step-lock" />}
        </li>
        <li className={purchased ? '' : 'locked'}>
          <span className="diag-step-n">3</span>
          <span><strong>Montar seu primeiro projeto</strong><em>algo concreto para mostrar</em></span>
          {!purchased && <LockIcon size={16} className="diag-step-lock" />}
        </li>
        <li className={purchased ? '' : 'locked'}>
          <span className="diag-step-n">4</span>
          <span><strong>Buscar as primeiras vagas</strong><em>{sample ? `${sample.first_jobs_count} cargos para procurar` : 'onde procurar'}</em></span>
          {!purchased && <LockIcon size={16} className="diag-step-lock" />}
        </li>
      </ol>
      {error && <div className="status error" role="alert">{error}</div>}
    </section>
  );
}
