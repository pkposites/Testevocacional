import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CATALOG_SIZE } from '../../shared/quiz';
import { api, ApiFailure } from '../api';
import { track } from '../analytics';
import { DiagnosticOffer, ScrollNudge, SwipeRow } from '../components/DiagnosticOffer';
import { DimIcon } from '../components/Icons';

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
  interest_detail?: { want?: string } | null;
  diagnostic?: { mode: 'waitlist' | 'paid'; price_cents: number; purchased: boolean; open_order_id: string | null };
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
  // Numeração das seções: sem a oferta (perfil amplo), as seguintes sobem um número.
  const n0 = !map.broadProfile && map.cards[0] ? 0 : -1;
  const doneCount = plan ? plan.days.filter((_, i) => checks[`${plan.careerId}:${i + 1}`]).length : 0;

  return (
    <div className="wrap">
      <span className="kicker">1 · Seu resultado</span>
      {!map.broadProfile && map.cards[0] ? (
        <div className="map-hero">
          <h1>{data.buyer_first_name}, seu 1º caminho é <span>{map.cards[0].name}</span></h1>
          <div className="map-hero-tags">
            {map.cards[0].match !== undefined && <span className="match big">{map.cards[0].match}% de afinidade</span>}
            {(map.profile ? map.profile.filter((b) => b.score >= map.profile![1].score) : map.summary.topDimensions).slice(0, 3).map((d) => (
              <span key={d.id} className="map-tag"><DimIcon dim={d.id} size={14} /> gosta de {d.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="map-hero">
          <h1>{data.buyer_first_name}, seus interesses são variados</h1>
          <p>Por isso o mapa traz 5 caminhos para explorar, sem apontar uma profissão ideal.</p>
        </div>
      )}

      {!map.broadProfile && map.cards[0] && (
        <DiagnosticOffer
          resultId={data.result_id} cards={map.cards} selectedId={selected}
          onSelect={(id) => { setSelected(id); void api('PUT', '/api/selection', { result_id: resultId, career_id: id }).catch(() => undefined); }}
          context={map.context}
          firstName={data.buyer_first_name} interested={interest} detail={data.interest_detail} diagnostic={data.diagnostic}
          onInterested={() => setInterest(true)}
        />
      )}

      {map.cards.map((c, idx) => (
        <Fragment key={c.careerId}>
        {idx === 0 && (
          <>
            <span className="kicker" style={{ marginTop: 28 }}>{3 + n0} · Por que combina com você</span>
            <h2 className="sec-title">{c.name}</h2>
          </>
        )}
        {idx === 1 && (
          <>
            <span className="kicker" style={{ marginTop: 28 }}>{4 + n0} · Seus outros {map.cards.length - 1} caminhos</span>
            <h2 className="sec-title">Também combinam com você</h2>
          </>
        )}
        {idx === 0 ? (
          <article className="card career">
            <div className="career-head">
              <h3>{c.dim && <span className="career-icon"><DimIcon dim={c.dim} size={18} /></span>}{c.name}</h3>
              {c.match !== undefined && <span className="match">{c.match}% de afinidade</span>}
            </div>
            {c.evidence && c.evidence.length > 0 ? (
              <ul className="evidence">{c.evidence.map((e) => <li key={e}>{e}.</li>)}</ul>
            ) : (
              <ul className="evidence">{c.reasons.slice(0, 2).map((r) => <li key={r}>{r}</li>)}</ul>
            )}
            <div className="facts">
              <div><b>Como é a rotina</b><span>{c.routine}</span></div>
              <div><b>Primeiro passo</b><span>{c.firstStep}</span></div>
              {c.tension && <div className="warn"><b>Onde pode pesar</b><span>{c.tension}</span></div>}
            </div>
            <details style={{ marginTop: 10 }}>
              <summary>Ver mais detalhes</summary>
              <dl>
                <dt>Ponto de atenção</dt><dd>{c.attention}</dd>
                <dt>Habilidade inicial</dt><dd>{c.skill}</dd>
                <dt>Miniatividade prática</dt><dd>{c.miniActivity}</dd>
                <dt>Como começar no seu momento</dt><dd>{c.entry}</dd>
                <dt>Para pesquisar</dt><dd>Busque por: <em>“{c.search}”</em></dd>
                <dt>Conversa com um profissional</dt>
                <dd>
                  <p style={{ margin: '4px 0' }}>“{map.common.professionalMessage}”</p>
                  <CopyButton text={map.common.professionalMessage} label="Copiar mensagem" />
                </dd>
                <dt>O que é a % de afinidade?</dt>
                <dd>O quanto suas respostas combinam com a rotina de cada caminho, entre {CATALOG_SIZE}. Não mede talento: poucos pontos de diferença é empate.</dd>
              </dl>
            </details>
            <button className={selected === c.careerId ? 'btn secondary' : 'btn'} style={{ marginTop: 12 }} onClick={() => choose(c.careerId)}>
              {selected === c.careerId ? 'Caminho escolhido ✓' : 'Testar este caminho por 7 dias'}
            </button>
          </article>
        ) : (
          <article className="card career compact">
            <div className="career-head">
              <h3><span className="pos-n">{c.position}º</span>{c.dim && <span className="career-icon"><DimIcon dim={c.dim} size={16} /></span>}{c.name}</h3>
              {c.match !== undefined && <span className="match">{c.match}%</span>}
            </div>
            <p className="career-why">{(c.evidence && c.evidence[0]) ?? c.reasons[0]}</p>
            <details>
              <summary>Ver detalhes</summary>
              {c.evidence && c.evidence.length > 1 && <ul className="evidence">{c.evidence.slice(1).map((e) => <li key={e}>{e}.</li>)}</ul>}
              {c.tension && <div className="status warn small" style={{ fontWeight: 500 }}><strong>Onde pode pesar:</strong> {c.tension}</div>}
              <dl>
                <dt>Como é a rotina</dt><dd>{c.routine}</dd>
                <dt>Primeiro passo</dt><dd>{c.firstStep}</dd>
                <dt>Ponto de atenção</dt><dd>{c.attention}</dd>
                <dt>Para pesquisar</dt><dd>Busque por: <em>“{c.search}”</em></dd>
              </dl>
            </details>
            <button className={selected === c.careerId ? 'btn secondary' : 'btn secondary'} style={{ marginTop: 10 }} onClick={() => choose(c.careerId)}>
              {selected === c.careerId ? 'Caminho escolhido ✓' : 'Testar este caminho por 7 dias'}
            </button>
          </article>
        )}
        {idx === 0 && !map.broadProfile && !data.diagnostic?.purchased && (
          <a className="diag-remind no-print" href="#diagnostico">
            <span>Quer o passo a passo para <strong>{c.name}</strong>?</span>
            <b>Baixar roteiro ↑</b>
          </a>
        )}
        {idx === map.cards.length - 1 && map.profile && (
          <details className="card profile-card">
            <summary><strong>Ver seu perfil de interesses</strong></summary>
            <ul className="profile" role="list" style={{ marginTop: 12 }}>
              {map.profile.map((b) => (
                <li key={b.id} className={!map.broadProfile && b.score >= map.profile![1].score ? 'top' : ''} title={`${b.label}: ${b.score} de 100`}>
                  <span className="pl"><DimIcon dim={b.id} size={16} className="pl-icon" />{b.label.charAt(0).toUpperCase() + b.label.slice(1)}</span>
                  <span className="pt" aria-hidden="true"><span style={{ width: `${Math.max(b.score, 2)}%` }} /></span>
                  <span className="pv">{b.score}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        </Fragment>
      ))}

      {map.leftOut && map.leftOut.length > 0 && (
        <details className="card soft">
          <summary><strong>Por que outros caminhos ficaram de fora</strong></summary>
          {map.leftOut.map((l) => (
            <p key={l.name} style={{ margin: '10px 0 0' }}><strong>{l.name}.</strong> {l.reason}</p>
          ))}
        </details>
      )}

      {map.broadProfile && <section className="card interest-card no-print" aria-labelledby="interest-title">
        <h2 id="interest-title">Quer ir além do mapa?</h2>
        <p>Estamos preparando um trajeto personalizado, com um roteiro do caminho que você escolher e os próximos passos para começar.</p>
        {interest ? (
          <div className="status ok" role="status">Anotado! Vamos te chamar no WhatsApp quando o trajeto estiver disponível.</div>
        ) : (
          <button className="btn" onClick={markInterest} disabled={interestBusy}>
            {interestBusy ? 'Registrando…' : 'Tenho interesse no Roteiro para começar'}
          </button>
        )}
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>Sem compromisso. Você só recebe uma mensagem quando estiver disponível.</p>
      </section>}

      <section id="plano" style={{ marginTop: 28 }}>
        <span className="kicker">{5 + n0} · Grátis</span>
        <h2 className="sec-title">Seu plano de 7 dias</h2>
        {!plan ? (
          <div className="card soft"><strong>Toque em "Testar este caminho por 7 dias"</strong> em um dos caminhos acima para montar seu plano.</div>
        ) : (
          <>
            <SwipeRow label="Escolher caminho do plano">
              {map.cards.map((c) => (
                <button key={c.careerId} type="button" role="radio" aria-checked={c.careerId === plan.careerId} onClick={() => choose(c.careerId)}>{c.name}</button>
              ))}
            </SwipeRow>
            <div className="card">
              <h3>{plan.name}</h3>
              <p className="plan-meta"><strong>{doneCount} de 7</strong> feitas · uma tarefa de 15 min por dia</p>
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
              <p>Dê uma nota de 1 a 5 para cada ponto.</p>
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

            </div>
          </>
        )}
      </section>

      <details className="card soft">
        <summary><strong>Como ingressar na área</strong></summary>
        <p style={{ marginTop: 10 }}>{map.common.howToEnter}</p>
      </details>

      {!interest && (map.broadProfile ? (
        <button className="btn secondary no-print" style={{ marginBottom: 12 }} onClick={markInterest} disabled={interestBusy}>
          Tenho interesse no Roteiro para começar
        </button>
      ) : (
        <a className="btn no-print" style={{ marginBottom: 12 }} href="#diagnostico">Baixar meu roteiro para {map.cards[0].name}</a>
      ))}
      <button className="btn secondary no-print" onClick={printMap}>Salvar ou imprimir</button>
      {!map.broadProfile && map.cards[0] && !data.diagnostic?.purchased && (
        <ScrollNudge career={map.cards[0].name} paid={data.diagnostic?.mode === 'paid'} />
      )}
      <p className="map-save">
        <strong>Seu mapa fica salvo.</strong> Para abrir em outro aparelho: <Link to="/acesso">Recuperar acesso</Link> com seu WhatsApp e o código <strong>{data.public_ref}</strong>.
      </p>
    </div>
  );
}
