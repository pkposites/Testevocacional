// Oferta do Diagnóstico (validação da versão paga): prévia bloqueada montada com as respostas da pessoa.
import { useState } from 'react';
import { QUESTIONS } from '../../shared/quiz';
import { api } from '../api';
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
const PRICES = [
  { value: 'gratis', label: 'Só se fosse grátis' },
  { value: 'ate20', label: 'Até R$ 20' },
  { value: 'ate50', label: 'Até R$ 50' },
  { value: 'ate100', label: 'Até R$ 100' },
  { value: 'mais100', label: 'Mais de R$ 100' },
];

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '');

/** Itens do diagnóstico, montados a partir do que a pessoa respondeu. */
export function diagnosticItems(c1: Card, c2: Card | undefined, ctx: Ctx): string[] {
  const items = [`Roteiro de 30 dias para entrar em ${c1.name}, com o que fazer em cada semana`];
  if (ctx.currentArea) items.push(`Como usar sua experiência em “${ctx.currentArea}” a seu favor nessa mudança`);
  else if (ctx.moment === 'first') items.push('Por onde começar sem experiência e sem gastar com o curso errado');
  else items.push('Quais habilidades que você já tem servem nessa área');
  items.push(`Plano para o ponto que pode pesar: ${lower(c1.attention)}`);
  items.push('Cursos, certificações e formações que valem a pena (e quais evitar)');
  if (ctx.dailyTime) items.push(`Ritmo ajustado aos seus ${ctx.dailyTime} minutos por dia`);
  if (c2) items.push(`${c1.name} ou ${c2.name}: qual testar primeiro no seu caso`);
  return items;
}

export function DiagnosticOffer(props: {
  resultId: string; first: Card; second?: Card; context: Ctx; firstName: string;
  interested: boolean; onInterested: () => void; detail?: { want?: string; price?: string } | null;
}) {
  const { resultId, first, second, context, firstName, interested, onInterested } = props;
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<{ want?: string; price?: string }>(props.detail ?? {});
  const [error, setError] = useState<string | null>(null);
  const items = diagnosticItems(first, second, context);

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

  async function answer(patch: { want?: string; price?: string }) {
    const next = { ...detail, ...patch };
    setDetail(next);
    await api('POST', '/api/interest/details', { result_id: resultId, ...patch }).catch((e) => setError((e as Error).message));
  }

  return (
    <section id="diagnostico" className="card diag" aria-labelledby="diag-title">
      <div className="diag-head">
        <span className="diag-badge"><SparkIcon size={14} /> Próximo passo · em preparação</span>
        <h2 id="diag-title">Seu Diagnóstico de {first.name}</h2>
        <p>
          {firstName}, o mapa mostra <strong>onde</strong> você tende a ter energia. O diagnóstico mostra <strong>como chegar lá</strong>:
          um plano feito a partir das suas {QUESTIONS.length} respostas para sair do teste e dar os primeiros passos reais.
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
          <div className="diag-weeks">{['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'].map((w) => <span key={w}>{w}</span>)}</div>
          <div className="diag-lock"><LockIcon size={22} /></div>
        </div>
      </div>

      <div className="small" style={{ fontWeight: 700, color: 'var(--title)', marginTop: 4 }}>O que vem no seu diagnóstico</div>
      <ul className="diag-items">
        {items.map((it) => (
          <li key={it}><LockIcon size={16} className="diag-li-icon" /><span>{it}</span></li>
        ))}
      </ul>

      {!interested ? (
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
          <div className="small" style={{ fontWeight: 700, margin: '14px 0 6px' }}>Quanto você investiria num diagnóstico assim?</div>
          <div className="chips" role="radiogroup" aria-label="Quanto investiria">
            {PRICES.map((p) => (
              <button key={p.value} type="button" role="radio" aria-checked={detail.price === p.value} onClick={() => answer({ price: p.value })}>{p.label}</button>
            ))}
          </div>
          {detail.want && detail.price && <p className="small muted" style={{ margin: '10px 0 0' }}>Obrigado! Isso nos ajuda a preparar o seu diagnóstico.</p>}
        </div>
      )}
      {error && <div className="status error" role="alert">{error}</div>}
    </section>
  );
}
