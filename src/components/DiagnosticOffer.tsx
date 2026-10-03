// Oferta do Roteiro para começar: a pessoa escolhe o caminho e vê uma amostra real antes de pagar.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, brl } from '../api';
import { track } from '../analytics';
import { CheckIcon, DimIcon, LockIcon, SparkIcon } from './Icons';

type Card = { careerId: string; name: string; attention: string; tension?: string | null; dim?: string; match?: number };
type Ctx = { moment?: string; dailyTime?: number; currentArea?: string };

const WANTS = [
  { value: 'roteiro', label: 'Um roteiro passo a passo para entrar na área' },
  { value: 'cursos', label: 'Saber quais cursos valem a pena (e quais evitar)' },
  { value: 'vagas', label: 'Como conseguir as primeiras oportunidades' },
  { value: 'mentoria', label: 'Conversar com alguém que já trabalha na área' },
];
/** As 4 etapas do roteiro: o que a pessoa leva, em linguagem direta. */
const STEPS = [
  { title: 'Testar a rotina da área', sub: 'antes de gastar com curso' },
  { title: 'Escolher a formação certa', sub: 'o que a área exige de verdade' },
  { title: 'Montar seu primeiro projeto', sub: 'algo concreto para mostrar' },
  { title: 'Buscar as primeiras vagas', sub: 'onde procurar e o que pesquisar' },
];

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

type Sample = { today: { activity: string; routine: string; requirement: string }; requirement: string; path: 'livre' | 'tecnico' | 'regulada'; proof_teaser: string; tasks: number };
const PATH_LABEL = { livre: 'Dá para começar sem diploma', tecnico: 'Curso técnico ou livre é o caminho comum', regulada: 'Exige formação ou registro' };

export function DiagnosticOffer(props: {
  resultId: string; cards: Card[]; selectedId?: string | null; onSelect?: (careerId: string) => void; context: Ctx; firstName: string;
  interested: boolean; onInterested: () => void; detail?: { want?: string } | null;
  diagnostic?: { mode: 'waitlist' | 'paid'; price_cents: number; purchased: boolean; open_order_id: string | null };
}) {
  const { resultId, cards, context, firstName, interested, onInterested, diagnostic } = props;
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
  return (
    <section id="diagnostico" className={`card diag${paid && !purchased ? ' diag-paid' : ''}`} aria-labelledby="diag-title">
      <div className="diag-head">
        <span className="diag-badge"><SparkIcon size={14} /> {purchased ? 'Liberado para você' : 'Roteiro para começar'}</span>
        <h2 id="diag-title" className="diag-title">
          {purchased ? <>Seu passo a passo para entrar em {first.name}</> : <>O passo a passo completo para entrar em <span>{first.name}</span></>}
        </h2>
        <p className="diag-promise">
          {firstName}, um plano prático de 4 semanas, montado com as suas respostas: o que fazer, em que ordem, até buscar a primeira vaga.
        </p>
      </div>

      <ol className="diag-steps">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <span className="diag-step-n">{i + 1}</span>
            <span><strong>{s.title}</strong><em>{s.sub}</em></span>
          </li>
        ))}
      </ol>

      {!purchased && cards.length > 1 && (
        <div className="diag-pick">
          <div className="diag-pick-label">Escolha o caminho do seu plano:</div>
          <div className="chips" role="radiogroup" aria-label="Caminho do roteiro">
            {cards.map((c) => (
              <button key={c.careerId} type="button" role="radio" aria-checked={c.careerId === first.careerId} onClick={() => pick(c.careerId)}>
                {c.name}{c.match !== undefined ? ` · ${c.match}%` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {!purchased && (
        <div className="diag-sample" aria-live="polite">
          <div className="diag-sample-head">
            {first.dim && <span className="diag-doc-icon"><DimIcon dim={first.dim} size={18} /></span>}
            <div className="diag-doc-title">Veja grátis o passo 1 · {first.name}</div>
          </div>
          {!sample ? <div className="spinner dark" aria-label="Carregando amostra" /> : (
            <>
              <p className="ds-today"><strong>Faça hoje:</strong> {sample.today.activity.replace(/^Faça esta atividade:\s*/, "")}</p>
              <span className="pill dg-path">{PATH_LABEL[sample.path]}</span>
              <div className="ds-lock"><LockIcon size={14} /> Passos 2, 3 e 4 no plano completo</div>
            </>
          )}
        </div>
      )}

      {purchased ? (
        <button className="btn" onClick={() => nav(`/diagnostico/${resultId}`)}>Abrir meu passo a passo</button>
      ) : paid ? (
        <div className="diag-buy">
          <div className="diag-price">
            <strong>{price}</strong>
            <span>Pagamento único no Pix · liberado na hora</span>
          </div>
          <button className="btn diag-cta" onClick={buy} disabled={busy}>
            {busy ? 'Gerando Pix…' : <>Quero meu passo a passo completo</>}
          </button>
          <p className="diag-foot">
            <CheckIcon size={15} /> {sample?.tasks ?? tasks} tarefas guiadas · {minutes} min por dia · fica salvo no seu WhatsApp
          </p>
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
      {error && <div className="status error" role="alert">{error}</div>}
    </section>
  );
}
