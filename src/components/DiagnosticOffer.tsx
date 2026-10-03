// Oferta do Roteiro para começar: a pessoa escolhe o caminho e vê uma amostra real antes de pagar.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUESTIONS } from '../../shared/quiz';
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
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '');

/** Itens do roteiro, montados a partir do que a pessoa respondeu. */
export function diagnosticItems(c1: Card, c2: Card | undefined, ctx: Ctx): string[] {
  const items = [`Plano de 4 semanas para testar ${c1.name} de verdade, com o que fazer em cada semana`];
  if (ctx.currentArea) items.push(`Como usar sua experiência em “${ctx.currentArea}” a seu favor nessa mudança`);
  else if (ctx.moment === 'first') items.push('Por onde começar sem experiência e sem gastar com o curso errado');
  else items.push('Quais habilidades que você já tem servem nessa área');
  items.push(`Plano para o ponto que pode pesar: ${lower(c1.attention)}`);
  items.push('A formação que a área pede de verdade e como escolher um curso sem cair em promessa');
  items.push('O primeiro projeto para mostrar no fim do mês e os termos de vaga para procurar');
  if (ctx.dailyTime) items.push(`Ritmo ajustado aos seus ${ctx.dailyTime} minutos por dia`);
  if (c2) items.push(`${c1.name} ou ${c2.name}: qual testar primeiro no seu caso`);
  return items;
}

const WEEKS = ['Experimentar a rotina', 'Escolher como aprender', 'Construir sua prova', 'Falar com o mercado'];

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
  const second = cards.find((c) => c.careerId !== first.careerId);
  const [sample, setSample] = useState<Sample | null>(null);
  const nav = useNavigate();
  const paid = diagnostic?.mode === 'paid';
  const purchased = !!diagnostic?.purchased;
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ want?: string }>(props.detail ?? {});
  const [error, setError] = useState<string | null>(null);
  const items = diagnosticItems(first, second, context);
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
  const hours = Math.round((minutes * 20) / 60);

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

  return (
    <section id="diagnostico" className={`card diag${paid && !purchased ? ' diag-paid' : ''}`} aria-labelledby="diag-title">
      <div className="diag-head">
        <span className="diag-badge"><SparkIcon size={14} /> {purchased ? 'Liberado para você' : paid ? 'Próximo passo' : 'Próximo passo · em preparação'}</span>
        <h2 id="diag-title">Roteiro para começar em {first.name}</h2>
        <p className="diag-promise">
          {firstName}, saia do teste com os primeiros passos: o que a área exige para entrar, uma atividade para fazer hoje, o primeiro projeto para mostrar e onde procurar as primeiras vagas.
        </p>
      </div>

      {!purchased && cards.length > 1 && (
        <div className="diag-pick">
          <div className="small" style={{ fontWeight: 700, color: 'var(--title)' }}>Para qual caminho você quer o roteiro?</div>
          <div className="chips" role="radiogroup" aria-label="Caminho do roteiro">
            {cards.map((c) => (
              <button key={c.careerId} type="button" role="radio" aria-checked={c.careerId === first.careerId} onClick={() => pick(c.careerId)}>
                {c.name}{c.match !== undefined ? ` · ${c.match}%` : ''}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ margin: '6px 0 0' }}>Depois de liberar, você também pode abrir o roteiro dos outros caminhos do seu mapa.</p>
        </div>
      )}

      <div className="diag-sample" aria-live="polite">
        <div className="diag-sample-head">
          {first.dim && <span className="diag-doc-icon"><DimIcon dim={first.dim} size={18} /></span>}
          <div>
            <div className="diag-doc-title">{purchased ? 'Seu roteiro' : 'Amostra real do seu roteiro'} · {first.name}</div>
            <div className="diag-doc-sub">Preparado para {firstName}{first.match !== undefined ? ` · ${first.match}% de afinidade` : ''}</div>
          </div>
        </div>
        {!sample ? <div className="spinner dark" aria-label="Carregando amostra" /> : (
          <>
            <div className="ds-block">
              <span className="ds-tag">Faça hoje</span>
              <ol className="ds-steps">
                <li>{sample.today.activity}</li>
                <li>{sample.today.routine}</li>
              </ol>
            </div>
            <div className="ds-block">
              <span className="ds-tag">Requisito para entrar · {PATH_LABEL[sample.path]}</span>
              <p>{sample.requirement}</p>
            </div>
            <div className={`ds-block${purchased ? '' : ' ds-locked'}`}>
              <span className="ds-tag">Seu primeiro projeto</span>
              <p>{sample.proof_teaser}</p>
              {!purchased && <span className="ds-lock"><LockIcon size={14} /> continua no roteiro</span>}
            </div>
            <div className="diag-weeks">{WEEKS.map((w, i) => <span key={w} className={i === 0 ? 'open' : ''}><b>Semana {i + 1}</b>{i === 0 ? w : ''}</span>)}</div>
          </>
        )}
      </div>

      <div className="small" style={{ fontWeight: 700, color: 'var(--title)', marginTop: 4 }}>O que vem no roteiro completo</div>
      <ul className="diag-items">
        {items.map((it) => (
          <li key={it}>{purchased ? <CheckIcon size={16} className="diag-li-icon" /> : <LockIcon size={16} className="diag-li-icon" />}<span>{it}</span></li>
        ))}
      </ul>

      {purchased ? (
        <button className="btn" onClick={() => nav(`/diagnostico/${resultId}`)}>Abrir meu roteiro</button>
      ) : paid ? (
        <div className="diag-buy">
          <div className="diag-stats">
            <div><strong>4</strong><span>semanas de plano</span></div>
            <div><strong>{sample?.tasks ?? tasks}</strong><span>tarefas guiadas</span></div>
            <div><strong>{hours} h</strong><span>no seu ritmo</span></div>
          </div>
          <div className="diag-price">
            <div className="diag-price-main">
              <span className="diag-price-label">Roteiro para começar em {first.name}</span>
              <strong>{brl(diagnostic!.price_cents)}</strong>
              <span className="diag-price-day">menos de {brl(Math.ceil(diagnostic!.price_cents / 28))} por dia do plano</span>
            </div>
            <ul className="diag-guarantees">
              <li><CheckIcon size={15} /> Pagamento único por Pix, sem assinatura</li>
              <li><CheckIcon size={15} /> Liberado aqui assim que o banco confirmar</li>
              <li><CheckIcon size={15} /> Fica salvo: abra quando quiser com seu WhatsApp</li>
            </ul>
          </div>
          <button className="btn diag-cta" onClick={buy} disabled={busy}>
            {busy ? 'Gerando Pix…' : <>Liberar meu roteiro por {brl(diagnostic!.price_cents)}</>}
          </button>
          <p className="small muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>Feito com as suas {QUESTIONS.length} respostas, não é um material genérico.</p>
        </div>
      ) : !interested ? (
        <>
          <button className="btn" onClick={want} disabled={busy}>
            {busy ? 'Registrando…' : `Quero o roteiro para começar em ${first.name}`}
          </button>
          <p className="small muted" style={{ margin: '8px 0 0' }}>Sem compromisso e sem pagamento agora. Quem pedir primeiro recebe primeiro, pelo WhatsApp.</p>
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
