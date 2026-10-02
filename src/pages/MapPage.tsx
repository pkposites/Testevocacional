import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CATALOG_SIZE, MOMENTS } from '../../shared/quiz';
import { api, ApiFailure } from '../api';
import { track } from '../analytics';
import { DiagnosticOffer } from '../components/DiagnosticOffer';
import { DimIcon, SparkIcon } from '../components/Icons';

type Card = {
  careerId: string; position: number; name: string; reasons: string[]; routine: string; attention: string;
  match?: number; evidence?: string[]; tension?: string | null; dim?: string;
  firstStep: string; skill: string; miniActivity: string; search: string; entry: string; days: string[];
};
type MapData = {
  result_id: string;
  public_ref: string;
  buyer_first_name: string;
  selected_career_id: string | null;
  offer_mode: 'free' | 'paid';
  diagnostic_interest: boolean;
  interest_detail?: { want?: string; price?: string } | null;
  map: {
    broadProfile: boolean;
    summary: { topDimensions: { id: string; label: string }[]; explanation: string };
    context: { moment?: string; dailyTime?: number; currentArea?: string };
    profile?: { id: string; label: string; score: number }[];
    cards: Card[];
    leftOut?: { name: string; reason: string }[];
    common: { professionalMessage: string; howToEnter: string; noProfessionalFallback: string; safetyNote: string; timeExtension: string | null };
  };
  progress: { career_id: string; day: number; checked: boolean }[];
  reflections: { career_id: string; interest: number | null; repeat_wish: number | null; difficulty: number | null; decision: string | null }[];
};

const DECISIONS = [
  { value: 'explore_more', label: 'Quero explorar mais' },
  { value: 'know_better', label: 'Preciso conhecer melhor' },
  { value: 'try_other', label: 'Prefiro testar outra opção' },
];

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn secondary" style={{ marginTop: 8 }} onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { /* sem permissão */ }
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    }}>{done ? 'Copiado ✓' : label}</button>
  );
}

/** Dimensões em destaque; com empate na segunda posição, todas as empatadas entram. */
function topLabels(map: MapData['map']): string {
  const labels = map.profile
    ? map.profile.filter((b) => b.score >= map.profile![1].score).map((b) => b.label)
    : map.summary.topDimensions.map((d) => d.label);
  return labels.length <= 2 ? labels.join(' e ') : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}

export function MapPage() {
  const { resultId } = useParams();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [refl, setRefl] = useState<Record<string, MapData['reflections'][number]>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [interest, setInterest] = useState(false);
  const [interestBusy, setInterestBusy] = useState(false);

  useEffect(() => {
    api<MapData>('GET', `/api/results/${resultId}/full`)
      .then((d) => {
        setData(d);
        setSelected(d.selected_career_id);
        setChecks(Object.fromEntries(d.progress.map((p) => [`${p.career_id}:${p.day}`, p.checked])));
        setRefl(Object.fromEntries(d.reflections.map((r) => [r.career_id, r])));
        setInterest(d.diagnostic_interest);
      })
      .catch((e: ApiFailure) => setError({ status: e.status, message: e.message }));
  }, [resultId]);

  const plan = useMemo(() => data?.map.cards.find((c) => c.careerId === selected) ?? null, [data, selected]);

  async function choose(careerId: string) {
    setSelected(careerId);
    document.getElementById('plano')?.scrollIntoView({ behavior: 'smooth' });
    await api('PUT', '/api/selection', { result_id: resultId, career_id: careerId }).catch(() => undefined);
  }

  async function toggle(careerId: string, day: number, checked: boolean) {
    const k = `${careerId}:${day}`;
    setChecks((c) => ({ ...c, [k]: checked }));
    try {
      await api('PUT', '/api/progress', { result_id: resultId, career_id: careerId, day, checked });
      setSaveError(null);
    } catch (e) {
      setChecks((c) => ({ ...c, [k]: !checked }));
      setSaveError((e as Error).message);
    }
  }

  async function saveRefl(careerId: string, patch: Partial<MapData['reflections'][number]>) {
    const empty = { career_id: careerId, interest: null, repeat_wish: null, difficulty: null, decision: null };
    const next = Object.assign(empty, refl[careerId], patch);
    setRefl((r) => ({ ...r, [careerId]: next }));
    await api('PUT', '/api/reflection', { result_id: resultId, ...next }).catch((e) => setSaveError((e as Error).message));
  }

  async function markInterest() {
    setInterestBusy(true);
    try {
      const r = await api('POST', '/api/interest', { result_id: resultId });
      track('DiagnosticInterest', { eventId: r.event_id });
      setInterest(true);
    } catch (e) {
      setSaveError((e as Error).message);
    }
    setInterestBusy(false);
  }

  function printMap() {
    document.querySelectorAll('details').forEach((d) => d.setAttribute('open', ''));
    window.print();
  }

  if (error) {
    return (
      <div className="wrap">
        <h1>{error.status === 403 ? 'Acesso não liberado neste aparelho' : 'Não foi possível abrir o mapa'}</h1>
        <p>{error.status === 403 ? 'Se você já comprou, abra o acesso com o WhatsApp e o código do pedido (MC-…).' : error.message}</p>
        <Link className="btn" to="/acesso">Recuperar meu acesso</Link>
        <p className="small" style={{ marginTop: 12 }}><Link to="/ajuda">Preciso de ajuda</Link></p>
      </div>
    );
  }
  if (!data) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;

  const { map } = data;
  const moment = MOMENTS.find((m) => m.value === map.context.moment)?.label;
  const doneCount = plan ? plan.days.filter((_, i) => checks[`${plan.careerId}:${i + 1}`]).length : 0;

  return (
    <div className="wrap">
      <span className="pill">{data.offer_mode === 'free' ? 'Código' : 'Pedido'} {data.public_ref}</span>
      <h1 style={{ marginTop: 10 }}>{data.buyer_first_name}, este é o seu Mapa da Carreira</h1>
      <div className="card soft">
        {moment && <p><strong>Seu momento:</strong> {moment}</p>}
        {map.context.currentArea && <p><strong>Área atual:</strong> {map.context.currentArea}</p>}
        <p style={{ marginBottom: 0 }}>
          {map.broadProfile
            ? 'Seu perfil reúne interesses variados. Os caminhos abaixo são experiências exploratórias, não uma profissão ideal.'
            : <>Suas preferências mais altas: <strong>{topLabels(map)}</strong>.</>}
        </p>
      </div>
      {!map.broadProfile && map.cards[0] && (
        <a href="#diagnostico" className="diag-banner no-print">
          <SparkIcon size={16} />
          <span>{interest ? <>Você está na lista do <strong>Diagnóstico de {map.cards[0].name}</strong></> : <>Seu <strong>Diagnóstico de {map.cards[0].name}</strong> está em preparação. Ver o que vem nele</>}</span>
        </a>
      )}
      {map.profile && (
        <section className="card" aria-labelledby="perfil-title">
          <h2 id="perfil-title" style={{ marginBottom: 4 }}>Seu perfil de interesses</h2>
          <p className="small muted">O quanto cada tipo de atividade combina com você, pelas suas respostas ao teste (0 a 100).</p>
          <ul className="profile" role="list">
            {map.profile.map((b) => (
              // Destaque: as duas maiores e quem empatar com a segunda.
              <li key={b.id} className={!map.broadProfile && b.score >= map.profile![1].score ? 'top' : ''} title={`${b.label}: ${b.score} de 100`}>
                <span className="pl"><DimIcon dim={b.id} size={16} className="pl-icon" />{b.label.charAt(0).toUpperCase() + b.label.slice(1)}</span>
                <span className="pt" aria-hidden="true"><span style={{ width: `${Math.max(b.score, 2)}%` }} /></span>
                <span className="pv">{b.score}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="small muted">Ordem baseada nas suas respostas e no catálogo de {CATALOG_SIZE} caminhos. Preferência por uma atividade não comprova habilidade.</p>

      <h2 style={{ marginTop: 20 }}>Seus cinco caminhos</h2>
      {map.cards.map((c, idx) => (
        <Fragment key={c.careerId}>
        <article className="card career">
          <div className="pos">{c.position}º caminho</div>
          <div className="career-head">
            <h3>{c.dim && <span className="career-icon"><DimIcon dim={c.dim} size={18} /></span>}{c.name}</h3>
            {c.match !== undefined && <span className="match" title="Afinidade com as suas respostas">{c.match}% de afinidade</span>}
          </div>
          {c.evidence && c.evidence.length > 0 ? (
            <>
              <div className="small" style={{ fontWeight: 700, color: 'var(--title)' }}>Por que combina com você</div>
              <ul className="evidence">
                {c.evidence.map((e) => <li key={e}>{e}.</li>)}
              </ul>
            </>
          ) : (
            <>
              <p>{c.reasons[0]}</p>
              <p>{c.reasons[1]}</p>
            </>
          )}
          {c.tension && <div className="status warn small" style={{ marginTop: 8, fontWeight: 500 }}><strong>Onde pode pesar:</strong> {c.tension}</div>}
          <dl>
            <dt>Rotina</dt><dd>{c.routine}</dd>
            <dt>Ponto de atenção</dt><dd>{c.attention}</dd>
            <dt>Primeiro passo</dt><dd>{c.firstStep}</dd>
          </dl>
          <details style={{ marginTop: 8 }}>
            <summary>Ver mais sobre este caminho</summary>
            <dl>
              <dt>Habilidade inicial</dt><dd>{c.skill}</dd>
              <dt>Miniatividade prática</dt><dd>{c.miniActivity}</dd>
              <dt>Como começar no seu momento</dt><dd>{c.entry}</dd>
              <dt>Para pesquisar</dt><dd>Busque por: <em>“{c.search}”</em></dd>
              <dt>Conversa com um profissional</dt>
              <dd>
                <p className="small" style={{ margin: '4px 0' }}>“{map.common.professionalMessage}”</p>
                <CopyButton text={map.common.professionalMessage} label="Copiar mensagem" />
                <p className="small muted" style={{ marginTop: 6 }}>{map.common.noProfessionalFallback}</p>
              </dd>
            </dl>
          </details>
          <button className={selected === c.careerId ? 'btn secondary' : 'btn'} style={{ marginTop: 12 }} onClick={() => choose(c.careerId)}>
            {selected === c.careerId ? 'Caminho escolhido ✓' : 'Quero experimentar este caminho'}
          </button>
        </article>
        {idx === 0 && !map.broadProfile && (
          <DiagnosticOffer
            resultId={data.result_id} first={c} second={map.cards[1]} context={map.context}
            firstName={data.buyer_first_name} interested={interest} detail={data.interest_detail}
            onInterested={() => setInterest(true)}
          />
        )}
        </Fragment>
      ))}


      {map.leftOut && map.leftOut.length > 0 && (
        <section className="card soft" aria-labelledby="fora-title">
          <h3 id="fora-title">Por que outros caminhos ficaram de fora</h3>
          {map.leftOut.map((l) => (
            <p key={l.name} className="small" style={{ marginBottom: 8 }}><strong>{l.name}.</strong> {l.reason}</p>
          ))}
          <p className="small muted" style={{ marginBottom: 0 }}>Não quer dizer que você não conseguiria: só que, hoje, suas respostas apontam mais para os cinco acima.</p>
        </section>
      )}

      {map.broadProfile && <section className="card interest-card no-print" aria-labelledby="interest-title">
        <h2 id="interest-title">Quer ir além do mapa?</h2>
        <p>Estamos preparando um trajeto personalizado, com um diagnóstico do caminho que você escolher e os próximos passos para começar.</p>
        {interest ? (
          <div className="status ok" role="status">Anotado! Vamos te chamar no WhatsApp quando o trajeto estiver disponível.</div>
        ) : (
          <button className="btn" onClick={markInterest} disabled={interestBusy}>
            {interestBusy ? 'Registrando…' : 'Tenho interesse em receber um trajeto/diagnóstico'}
          </button>
        )}
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>Sem compromisso. Você só recebe uma mensagem quando estiver disponível.</p>
      </section>}

      <section id="plano" style={{ marginTop: 24 }}>
        <h2>Plano de 7 dias</h2>
        {!plan ? (
          <div className="card soft">Escolha acima qual caminho quer experimentar primeiro. Você pode trocar quando quiser.</div>
        ) : (
          <>
            <div className="tabs" role="tablist" aria-label="Escolher caminho do plano">
              {map.cards.map((c) => (
                <button key={c.careerId} role="tab" aria-selected={c.careerId === plan.careerId} onClick={() => choose(c.careerId)}>{c.name}</button>
              ))}
            </div>
            <div className="card">
              <h3>{plan.name}</h3>
              <p className="small muted">Uma tarefa por dia, de 15 minutos. {map.common.timeExtension}</p>
              <p className="small"><strong>{doneCount} de 7</strong> concluídas</p>
              {plan.days.map((d, i) => {
                const day = i + 1;
                const k = `${plan.careerId}:${day}`;
                return (
                  <label key={k} className={`day${checks[k] ? ' done' : ''}`}>
                    <input type="checkbox" checked={!!checks[k]} onChange={(e) => toggle(plan.careerId, day, e.target.checked)} />
                    <span><span className="lbl">Dia {day}</span><span className="txt">{d}</span></span>
                  </label>
                );
              })}
              {saveError && <div className="status error" role="alert">{saveError}</div>}
            </div>

            <div className="card">
              <h3>Reflexão do dia 7</h3>
              <p className="small muted">Dê uma nota de 1 a 5. Uma semana é uma experiência inicial, não uma decisão definitiva.</p>
              {([
                ['interest', 'Interesse pela tarefa'],
                ['repeat_wish', 'Vontade de repetir'],
                ['difficulty', 'Disposição para aprender as partes difíceis'],
              ] as const).map(([key, label]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div className="small" style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
                  <div className="scale" role="group" aria-label={label}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} aria-pressed={refl[plan.careerId]?.[key] === n} onClick={() => saveRefl(plan.careerId, { [key]: n })}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="small" style={{ fontWeight: 600, margin: '12px 0 6px' }}>Qual próximo passo você escolhe?</div>
              <div className="options" style={{ margin: 0 }} role="radiogroup">
                {DECISIONS.map((d) => (
                  <button key={d.value} className="option" role="radio" aria-checked={refl[plan.careerId]?.decision === d.value}
                    onClick={() => saveRefl(plan.careerId, { decision: d.value })}>
                    <span className="dot" />{d.label}
                  </button>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>Sua escolha fica registrada só como reflexão. {map.common.safetyNote}</p>
            </div>
          </>
        )}
      </section>

      <div className="card soft">
        <h3>Como ingressar</h3>
        <p className="small">{map.common.howToEnter}</p>
      </div>

      {!interest && (map.broadProfile ? (
        <button className="btn secondary no-print" style={{ marginBottom: 12 }} onClick={markInterest} disabled={interestBusy}>
          Tenho interesse em receber um trajeto/diagnóstico
        </button>
      ) : (
        <a className="btn secondary no-print" style={{ marginBottom: 12 }} href="#diagnostico">Ver meu Diagnóstico de {map.cards[0].name}</a>
      ))}
      <button className="btn secondary no-print" onClick={printMap}>Salvar ou imprimir</button>
      <p className="small muted" style={{ marginTop: 12 }}>
        Este mapa fica salvo. Para voltar em outro aparelho, use <Link to="/acesso">Recuperar acesso</Link> com seu WhatsApp e o código <strong>{data.public_ref}</strong>. Anote ou tire um print.
      </p>
    </div>
  );
}
