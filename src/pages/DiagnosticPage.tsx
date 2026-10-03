// Diagnóstico pago: plano de 4 semanas montado no servidor a partir das respostas da pessoa.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiFailure } from '../api';
import { CheckIcon, DimIcon, SparkIcon } from '../components/Icons';

type Week = { week: number; title: string; goal: string; tasks: string[] };
type Diagnostic = {
  career: { id: string; name: string; match?: number; dim?: string };
  headline: string;
  why: string[];
  hoursTotal: number;
  minutesPerDay: number;
  today?: { activity: string; routine: string; requirement: string };
  formation: { path: 'livre' | 'tecnico' | 'regulada'; text: string; courseTerms: string[]; checklist: string[]; redFlags: string[]; warning: string | null };
  experience: { area: string | null; carries: string[]; text: string };
  strengths: string[];
  attention: { point: string; plan: string }[];
  weeks: Week[];
  proof: string;
  firstJobs: string[];
  talk: { who: string; questions: string[] };
  compare: { other: string; chooseThis: string; chooseOther: string; recommendation: string } | null;
  closing: string;
};
type Data = { result_id: string; buyer_first_name: string; cards: { careerId: string; name: string; match: number | null }[]; diagnostic: Diagnostic };

const PATH_LABEL = { livre: 'Dá para começar sem diploma', tecnico: 'Curso técnico ou livre é o caminho comum', regulada: 'Exige formação ou registro' };

export function DiagnosticPage() {
  const { resultId } = useParams();
  const [career, setCareer] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const storeKey = `diag:${resultId}:${data?.diagnostic.career.id ?? ''}`;

  useEffect(() => {
    const q = career ? `?career=${encodeURIComponent(career)}` : '';
    api<Data>('GET', `/api/diagnostic/${resultId}${q}`)
      .then((d) => { setData(d); setError(null); })
      .catch((e: ApiFailure) => setError({ status: e.status, message: e.message }));
  }, [resultId, career]);

  useEffect(() => {
    if (!data) return;
    try { setDone(JSON.parse(localStorage.getItem(storeKey) || '{}')); } catch { setDone({}); }
  }, [data, storeKey]);

  function toggle(k: string) {
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* sem armazenamento */ }
  }

  if (error) {
    return (
      <div className="wrap">
        <h1>{error.status === 402 ? 'Diagnóstico ainda não liberado' : error.status === 403 ? 'Acesso não liberado neste aparelho' : 'Não foi possível abrir o diagnóstico'}</h1>
        <p>{error.status === 402 ? 'Você pode liberar o diagnóstico pelo seu mapa.' : error.status === 403 ? 'Abra o acesso com seu WhatsApp e o código do pedido (DG-… ou MC-…).' : error.message}</p>
        {error.status === 402 ? <Link className="btn" to={`/mapa/${resultId}#diagnostico`}>Voltar ao mapa</Link> : <Link className="btn" to="/acesso">Recuperar meu acesso</Link>}
      </div>
    );
  }
  if (!data) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;

  const d = data.diagnostic;
  const total = d.weeks.reduce((s, w) => s + w.tasks.length, 0);
  const doneCount = d.weeks.reduce((s, w) => s + w.tasks.filter((_, i) => done[`${w.week}:${i}`]).length, 0);

  return (
    <div className="wrap diag-page">
      <span className="diag-badge"><SparkIcon size={14} /> Diagnóstico de Carreira</span>
      <h1 style={{ marginTop: 10 }}>
        {d.career.dim && <span className="career-icon"><DimIcon dim={d.career.dim} size={20} /></span>}
        {data.buyer_first_name}, seu diagnóstico de {d.career.name}
      </h1>
      <p>{d.headline}</p>
      <div className="dg-stats">
        {d.career.match !== undefined && <div><strong>{d.career.match}%</strong><span>de afinidade</span></div>}
        <div><strong>4</strong><span>semanas</span></div>
        <div><strong>{d.minutesPerDay} min</strong><span>por dia · ~{d.hoursTotal} h</span></div>
      </div>

      {d.today && (
        <section className="card dg-today">
          <span className="diag-badge">Faça hoje</span>
          <h2 style={{ margin: '8px 0 4px' }}>Antes de se matricular em qualquer curso</h2>
          <ol className="steps">
            <li>{d.today.activity}</li>
            <li>{d.today.routine}</li>
            <li>{d.today.requirement}</li>
          </ol>
          <p className="small muted" style={{ margin: 0 }}>Leva menos de {d.minutesPerDay} minutos e já mostra se vale a pena seguir.</p>
        </section>
      )}

      {data.cards.length > 1 && (
        <label className="small no-print" style={{ display: 'block', margin: '6px 0 14px' }}>
          Ver o diagnóstico de outro caminho do seu mapa:{' '}
          <select value={d.career.id} onChange={(e) => setCareer(e.target.value)}>
            {data.cards.map((c) => <option key={c.careerId} value={c.careerId}>{c.name}{c.match !== null ? ` (${c.match}%)` : ''}</option>)}
          </select>
        </label>
      )}

      <section className="card">
        <h2>Por que este caminho, pelas suas respostas</h2>
        <ul className="evidence">{d.why.map((w) => <li key={w}>{w.replace(/\.$/, '')}.</li>)}</ul>
        {d.strengths.length > 0 && (
          <>
            <h3>Use a seu favor</h3>
            <ul className="dg-list">{d.strengths.map((s) => <li key={s}><CheckIcon size={16} className="diag-li-icon" /><span>{s}</span></li>)}</ul>
          </>
        )}
      </section>

      <section className="card">
        <h2>Onde pode pesar e como contornar</h2>
        {d.attention.map((a) => (
          <div key={a.point} className="dg-attn">
            <div className="status warn small" style={{ fontWeight: 500 }}>{a.point}</div>
            <p className="small" style={{ margin: '6px 0 12px' }}><strong>Como contornar:</strong> {a.plan}</p>
          </div>
        ))}
      </section>

      <section className="card soft">
        <h2>Sua experiência conta</h2>
        <p style={{ marginBottom: 0 }}>{d.experience.text}</p>
      </section>

      <section aria-labelledby="plano-title">
        <h2 id="plano-title" style={{ marginTop: 20 }}>Seu plano de 4 semanas</h2>
        <p className="small muted">{doneCount} de {total} tarefas feitas · marque conforme for fazendo (fica salvo neste aparelho).</p>
        <div className="dg-progress" aria-hidden="true"><span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} /></div>
        {d.weeks.map((w) => (
          <article key={w.week} className="card dg-week">
            <div className="pos">Semana {w.week}</div>
            <h3>{w.title}</h3>
            <p className="small muted">{w.goal}</p>
            <ul className="days">
              {w.tasks.map((t, i) => {
                const k = `${w.week}:${i}`;
                return (
                  <li key={k}>
                    <label className="day">
                      <input type="checkbox" checked={!!done[k]} onChange={() => toggle(k)} />
                      <span>{t}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      <section className="card">
        <h2>Formação: o que a área pede de verdade</h2>
        <span className={`pill dg-path ${d.formation.path}`}>{PATH_LABEL[d.formation.path]}</span>
        <p style={{ marginTop: 10 }}>{d.formation.text}</p>
        {d.formation.warning && <div className="status warn small" style={{ fontWeight: 500 }}>{d.formation.warning}</div>}
        <h3>O que pesquisar</h3>
        <ul className="dg-terms">{d.formation.courseTerms.map((t) => <li key={t}>“{t}”</li>)}</ul>
        <h3>Um bom curso…</h3>
        <ul className="dg-list">{d.formation.checklist.map((c) => <li key={c}><CheckIcon size={16} className="diag-li-icon" /><span>{c}</span></li>)}</ul>
        <h3>Fuja se…</h3>
        <ul className="dg-list bad">{d.formation.redFlags.map((c) => <li key={c}><span className="x" aria-hidden="true">×</span><span>{c}</span></li>)}</ul>
        <p className="small muted">Não indicamos escolas nem recebemos comissão de cursos: os critérios acima servem para você escolher sozinho.</p>
      </section>

      <section className="card">
        <h2>Sua prova do mês</h2>
        <p>{d.proof}</p>
        <h3>Onde procurar as primeiras oportunidades</h3>
        <p className="small muted" style={{ marginTop: 0 }}>Use estes termos em sites de vagas, LinkedIn e grupos da sua cidade:</p>
        <ul className="dg-terms">{d.firstJobs.map((j) => <li key={j}>“{j}”</li>)}</ul>
      </section>

      <section className="card">
        <h2>Conversa com quem já trabalha nisso</h2>
        <p>Procure {d.talk.who}. Três perguntas que valem a conversa:</p>
        <ol className="steps">{d.talk.questions.map((q) => <li key={q}>{q}</li>)}</ol>
      </section>

      {d.compare && (
        <section className="card soft">
          <h2>{d.career.name} ou {d.compare.other}?</h2>
          <p>{d.compare.chooseThis}</p>
          <p>{d.compare.chooseOther}</p>
          <p style={{ marginBottom: 0 }}><strong>Nossa sugestão:</strong> {d.compare.recommendation}</p>
        </section>
      )}

      <p className="small muted">{d.closing}</p>
      <div className="no-print" style={{ display: 'grid', gap: 8 }}>
        <button className="btn secondary" onClick={() => window.print()}>Salvar em PDF / imprimir</button>
        <Link className="btn link" to={`/mapa/${data.result_id}`}>Voltar ao meu mapa</Link>
      </div>
    </div>
  );
}
