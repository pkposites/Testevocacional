import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CURRENT_AREA_MAX, DAILY_TIMES, MOMENTS, QUESTIONS, SCALE, type Answers, type QuizContext } from '../../shared/quiz';
import { api, ApiFailure, storage } from '../api';
import { getAttribution, getConsent, metaCookies, track } from '../analytics';

const DRAFT_KEY = 'mc_draft';
type Draft = { answers: Answers; context: QuizContext; step: number };

function readDraft(): Draft | null {
  try {
    return JSON.parse(storage.get(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

export function Quiz() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [context, setContext] = useState<QuizContext>({});
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  // Restaura a sessão do servidor (fonte da verdade) ou cria uma nova.
  useEffect(() => {
    (async () => {
      const startNew = params.get('novo') === '1';
      try {
        if (startNew) throw new ApiFailure(401, 'new', '');
        const s = await api('GET', '/api/quiz/sessions/me');
        const draft = readDraft();
        const merged = { ...s.answers, ...(draft?.answers ?? {}) };
        setAnswers(merged);
        setContext({ ...s.context, ...(draft?.context ?? {}) });
        const firstMissing = QUESTIONS.findIndex((q) => !merged[q.id]);
        setStep(draft ? Math.min(draft.step, firstMissing === -1 ? 12 : firstMissing) : firstMissing === -1 ? 12 : firstMissing);
        if (draft) void save(merged, { ...s.context, ...(draft.context ?? {}) });
      } catch (e) {
        if (e instanceof ApiFailure && (e.status === 401 || e.code === 'new')) {
          storage.del(DRAFT_KEY);
          try {
            await api('POST', '/api/quiz/sessions', { attribution: getAttribution(), consent: getConsent(), ...metaCookies() });
          } catch (err) {
            setError((err as Error).message);
          }
        } else setError((e as Error).message);
      } finally {
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready) storage.set(DRAFT_KEY, JSON.stringify({ answers, context, step }));
  }, [answers, context, step, ready]);

  function save(a: Answers, c: QuizContext) {
    saveQueue.current = saveQueue.current
      .then(() => api('PUT', '/api/quiz/sessions/me', { answers: a, context: c }))
      .then(() => setError(null))
      .catch((e) => setError(e instanceof ApiFailure && e.code === 'network' ? 'Sem conexão: suas respostas estão guardadas neste aparelho e serão enviadas quando a internet voltar.' : (e as Error).message));
    return saveQueue.current;
  }

  function choose(qid: string, value: number) {
    const next = { ...answers, [qid]: value };
    setAnswers(next);
    if (Object.keys(answers).length === 0) track('GameStart');
    void save(next, context);
  }

  async function finish() {
    setCalculating(true);
    setError(null);
    const started = Date.now();
    try {
      await save(answers, context);
      await saveQueue.current;
      const r = await api('POST', '/api/results', { consent: getConsent(), ...metaCookies() });
      // Teste completo (alto engajamento): mesmo event_id que o servidor envia à API de Conversões.
      track('QuizComplete', { eventId: r.event_id });
      // Animação breve (até 1 s) apenas enquanto o cálculo real termina.
      const wait = Math.max(0, 600 - (Date.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      storage.del(DRAFT_KEY);
      nav('/previa');
    } catch (e) {
      setError((e as Error).message);
      setCalculating(false);
    }
  }

  if (!ready) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;

  if (step >= QUESTIONS.length) {
    const ok = !!context.moment && !!context.dailyTime;
    return (
      <div className="wrap">
        <div className="progress" aria-hidden="true"><div style={{ width: '100%' }} /></div>
        <h2>Para adaptar seu plano</h2>
        <p className="muted">Isso não muda a pontuação, só a forma de começar.</p>

        <h3 id="moment-label" style={{ marginTop: 18 }}>Qual é o seu momento?</h3>
        <div className="options" role="radiogroup" aria-labelledby="moment-label">
          {MOMENTS.map((m) => (
            <button key={m.value} className="option" role="radio" aria-checked={context.moment === m.value}
              onClick={() => { const c = { ...context, moment: m.value }; setContext(c); void save(answers, c); }}>
              <span className="dot" />{m.label}
            </button>
          ))}
        </div>

        <h3 id="time-label">Quanto tempo por dia você pode dedicar?</h3>
        <div className="options" role="radiogroup" aria-labelledby="time-label">
          {DAILY_TIMES.map((t) => (
            <button key={t.value} className="option" role="radio" aria-checked={context.dailyTime === t.value}
              onClick={() => { const c = { ...context, dailyTime: t.value }; setContext(c); void save(answers, c); }}>
              <span className="dot" />{t.label}
            </button>
          ))}
        </div>
        <p className="small muted">As tarefas base têm 15 minutos. Com mais tempo, você recebe uma extensão opcional.</p>

        <label htmlFor="area" style={{ marginTop: 18 }}>Área atual de estudo ou trabalho <span className="muted">(opcional)</span></label>
        <input id="area" type="text" maxLength={CURRENT_AREA_MAX} value={context.currentArea ?? ''} placeholder="Ex.: atendimento, administração, estudante"
          onChange={(e) => setContext({ ...context, currentArea: e.target.value })}
          onBlur={() => void save(answers, context)} />
        <p className="small muted">Serve só como contexto. Não usamos esse texto para calcular nada.</p>

        {error && <div className="status error" role="alert">{error}</div>}
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn secondary" onClick={() => setStep(QUESTIONS.length - 1)} disabled={calculating}>Voltar</button>
          <button className="btn" disabled={!ok || calculating} onClick={finish}>
            {calculating ? <><span className="spinner" /> Calculando…</> : 'Ver minha prévia'}
          </button>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[step];
  const value = answers[q.id];
  return (
    <div className="wrap">
      <p className="small muted" aria-live="polite">Pergunta {step + 1} de {QUESTIONS.length}</p>
      <div className="progress" aria-hidden="true"><div style={{ width: `${(step / QUESTIONS.length) * 100}%` }} /></div>
      {step === 6 && (
        <div className="status info">Suas respostas estão ajudando a identificar as atividades que você prefere.</div>
      )}
      <h2>{q.text}</h2>
      <p className="small muted">Não há resposta certa. Escolha o quanto essa frase tem a ver com você.</p>
      <div className="options" role="group" aria-label="Escala de resposta">
        {SCALE.map((o) => (
          <button key={o.value} className="option" aria-pressed={value === o.value} onClick={() => choose(q.id, o.value)}>
            <span className="dot" />{o.label}
          </button>
        ))}
      </div>
      {error && <div className="status warn" role="alert">{error}</div>}
      <div className="row">
        <button className="btn secondary" onClick={() => setStep(step - 1)} disabled={step === 0}>Voltar</button>
        <button className="btn" disabled={!value} onClick={() => setStep(step + 1)}>Continuar</button>
      </div>
    </div>
  );
}
