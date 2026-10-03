// Oferta do Diagnóstico (validação da versão paga): prévia bloqueada montada com as respostas da pessoa.
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

/** Itens do diagnóstico, montados a partir do que a pessoa respondeu. */
export function diagnosticItems(c1: Card, c2: Card | undefined, ctx: Ctx): string[] {
  const items = [`Plano de 4 semanas para testar ${c1.name} de verdade, com o que fazer em cada semana`];
  if (ctx.currentArea) items.push(`Como usar sua experiência em “${ctx.currentArea}” a seu favor nessa mudança`);
  else if (ctx.moment === 'first') items.push('Por onde começar sem experiência e sem gastar com o curso errado');
  else items.push('Quais habilidades que você já tem servem nessa área');
  items.push(`Plano para o ponto que pode pesar: ${lower(c1.attention)}`);
  items.push('A formação que a área pede de verdade e como escolher um curso sem cair em promessa');
  items.push('A prova prática para ter pronta no fim do mês e os termos de vaga para procurar');
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
      <span>{paid ? <>Seu <strong>plano de 4 semanas</strong> para {career} está pronto</> : <>Veja o próximo passo para {career}</>}</span>
      <svg className="nudge-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
    </button>
  );
}

export function DiagnosticOffer(props: {
  resultId: string; first: Card; second?: Card; context: Ctx; firstName: string;
  interested: boolean; onInterested: () => void; detail?: { want?: string } | null;
  diagnostic?: { mode: 'waitlist' | 'paid'; price_cents: number; purchased: boolean; open_order_id: string | null };
}) {
  const { resultId, first, second, context, firstName, interested, onInterested, diagnostic } = props;
  const nav = useNavigate();
  const paid = diagnostic?.mode === 'paid';
  const purchased = !!diagnostic?.purchased;
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ want?: string }>(props.detail ?? {});
  const [error, setError] = useState<string | null>(null);
  const items = diagnosticItems(first, second, context);
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
        <h2 id="diag-title">Como começar em {first.name}</h2>
        <p className="diag-promise">
          {firstName}, receba um <strong>roteiro prático</strong> para explorar {first.name} e dar os primeiros passos: o que pesquisar, requisitos para entrar, formação necessária e uma atividade da rotina para testar hoje.
        </p>
      </div>

      <div className="diag-preview" aria-hidden="true">
        <div className="diag-doc">
          <div className="diag-doc-top">
            {first.dim && <span className="diag-doc-icon"><DimIcon dim={first.dim} size={18} /></span>}
            <div>
              <div className="diag-doc-title">Diagnóstico · {first.name}</div>
              <div className="diag-doc-sub">Preparado para {firstName}{first.match !== undefined ? ` · ${first.match}% de afinidade` : ''}</div>
            </div>
          </div>
          <div className="diag-lines"><span /><span /><span /><span /></div>
          <div className="diag-weeks">{WEEKS.map((w, i) => <span key={w} className={i === 0 ? 'open' : ''}><b>Semana {i + 1}</b>{i === 0 ? w : ''}</span>)}</div>
          {!purchased && <div className="diag-lock"><LockIcon size={22} /></div>}
        </div>
      </div>

      <div className="small" style={{ fontWeight: 700, color: 'var(--title)', marginTop: 4 }}>O que vem no seu diagnóstico</div>
      <ul className="diag-items">
        {items.map((it) => (
          <li key={it}>{purchased ? <CheckIcon size={16} className="diag-li-icon" /> : <LockIcon size={16} className="diag-li-icon" />}<span>{it}</span></li>
        ))}
      </ul>

      {purchased ? (
        <button className="btn" onClick={() => nav(`/diagnostico/${resultId}`)}>Abrir meu diagnóstico</button>
      ) : paid ? (
        <div className="diag-buy">
          <div className="diag-stats">
            <div><strong>4</strong><span>semanas de plano</span></div>
            <div><strong>{tasks}</strong><span>tarefas guiadas</span></div>
            <div><strong>{hours} h</strong><span>no seu ritmo</span></div>
          </div>
          <div className="diag-price">
            <div className="diag-price-main">
              <span className="diag-price-label">Diagnóstico completo de {first.name}</span>
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
            {busy ? 'Gerando Pix…' : <>Liberar meu diagnóstico por {brl(diagnostic!.price_cents)}</>}
          </button>
          <p className="small muted" style={{ margin: '8px 0 0', textAlign: 'center' }}>Feito com as suas {QUESTIONS.length} respostas, não é um material genérico.</p>
        </div>
      ) : !interested ? (
        <>
          <button className="btn" onClick={want} disabled={busy}>
            {busy ? 'Registrando…' : `Quero meu diagnóstico de ${first.name}`}
          </button>
          <p className="small muted" style={{ margin: '8px 0 0' }}>Sem compromisso e sem pagamento agora. Quem pedir primeiro recebe primeiro, pelo WhatsApp.</p>
        </>
      ) : (
        <div className="diag-after">
          <div className="status ok" role="status"><CheckIcon size={20} className="diag-ok-icon" /><span>Você está na lista do Diagnóstico de {first.name}. Avisamos pelo WhatsApp.</span></div>
          <div className="small" style={{ fontWeight: 700, margin: '14px 0 6px' }}>Para montarmos do jeito certo: o que mais te ajudaria agora?</div>
          <div className="chips" role="radiogroup" aria-label="O que mais te ajudaria">
            {WANTS.map((w) => (
              <button key={w.value} type="button" role="radio" aria-checked={detail.want === w.value} onClick={() => answer({ want: w.value })}>{w.label}</button>
            ))}
          </div>
          {detail.want && <p className="small muted" style={{ margin: '10px 0 0' }}>Obrigado! Isso nos ajuda a preparar o seu diagnóstico.</p>}
        </div>
      )}
      {error && <div className="status error" role="alert">{error}</div>}
    </section>
  );
}
