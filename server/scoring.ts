// Cálculo determinístico da especificação v1. Heurística editorial: não representa chance de sucesso.
import { DIMENSIONS, DIMENSION_LABELS, QUESTIONS, SCALE, type Answers, type Dimension, type QuizContext } from '../shared/quiz';
import {
  CAREERS, CONTENT_VERSION, DIMENSION_ACTIVITIES, HOW_TO_ENTER, MOMENT_ENTRY, NO_PROFESSIONAL_FALLBACK,
  PROFESSIONAL_MESSAGE, REASON_PHRASES, RESULT_VERSION, SAFETY_NOTE, TIME_EXTENSIONS, type Career,
} from './content/careers.v1';

export type UserVector = Record<Dimension, number>;

export function userVector(answers: Answers): UserVector {
  const out = {} as UserVector;
  for (const dim of DIMENSIONS) {
    const vals = QUESTIONS.filter((q) => q.dimension === dim).map((q) => answers[q.id] as number);
    const mean = vals.reduce((s, x) => s + x, 0) / vals.length;
    out[dim] = (mean - 1) / 4;
  }
  return out;
}

export function careerVector(c: Career): UserVector {
  const out = {} as UserVector;
  // Mesma escala da pessoa (0 a 1): 1 → 0, 5 → 1.
  for (const dim of DIMENSIONS) out[dim] = (c.vector[dim] - 1) / 4;
  return out;
}

function centered(x: UserVector): UserVector {
  const mean = DIMENSIONS.reduce((s, d) => s + x[d], 0) / DIMENSIONS.length;
  const out = {} as UserVector;
  for (const d of DIMENSIONS) out[d] = x[d] - mean;
  return out;
}

/** Peso do formato do perfil (o que se destaca) frente ao nível de interesse nas atividades da carreira. */
export const SHAPE_WEIGHT = 0.7;

/**
 * Afinidade 0–100 (scoring-v2).
 * - Formato (70%): correlação entre o que se destaca na pessoa e o que se destaca na carreira,
 *   independente de a pessoa responder tudo alto ou tudo baixo.
 * - Nível (30%): o quanto a pessoa gosta das atividades que a carreira mais exige (média ponderada).
 * Heurística editorial: indica tarefas que tendem a dar energia, não chance de sucesso.
 */
export function affinity(u: UserVector, v: UserVector): number {
  const uc = centered(u);
  const vc = centered(v);
  const nu = Math.sqrt(DIMENSIONS.reduce((s, d) => s + uc[d] ** 2, 0));
  const nv = Math.sqrt(DIMENSIONS.reduce((s, d) => s + vc[d] ** 2, 0));
  const corr = nu < 1e-9 || nv < 1e-9 ? 0 : DIMENSIONS.reduce((s, d) => s + uc[d] * vc[d], 0) / (nu * nv);
  const wsum = DIMENSIONS.reduce((s, d) => s + v[d], 0) || 1;
  const level = DIMENSIONS.reduce((s, d) => s + v[d] * u[d], 0) / wsum;
  const score = 100 * (SHAPE_WEIGHT * (corr + 1) / 2 + (1 - SHAPE_WEIGHT) * level);
  // Arredonda para que afinidades matematicamente iguais empatem de fato (ruído de ponto flutuante).
  return Math.round(score * 1e9) / 1e9;
}

export function isBroadProfile(answers: Answers, u: UserVector): boolean {
  const vals = QUESTIONS.map((q) => answers[q.id]);
  const allEqual = vals.every((x) => x === vals[0]);
  const ds = DIMENSIONS.map((d) => u[d]);
  return allEqual || Math.max(...ds) - Math.min(...ds) < 0.25;
}

/** Ordena dimensões por valor decrescente; empate pela ordem fixa P,A,C,S,N,O. */
function topDims(values: Record<Dimension, number>, n: number): Dimension[] {
  const r = (x: number) => Math.round(x * 1e9);
  return [...DIMENSIONS]
    .sort((a, b) => r(values[b]) - r(values[a]) || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b))
    .slice(0, n);
}

export type RankedCareer = { id: string; affinity: number };

export function rankCareers(u: UserVector): RankedCareer[] {
  return CAREERS.map((c) => ({ id: c.id, affinity: affinity(u, careerVector(c)) }))
    .sort((a, b) => b.affinity - a.affinity || a.id.localeCompare(b.id));
}

export function reasonDims(u: UserVector, c: Career): Dimension[] {
  const v = careerVector(c);
  const m = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) m[d] = Math.min(u[d], v[d]);
  return topDims(m, 2);
}

export function attentionText(u: UserVector, c: Career): string {
  const v = careerVector(c);
  const gaps = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) gaps[d] = v[d] - u[d];
  const [dim] = topDims(gaps, 1);
  if (gaps[dim] > 0.4) {
    return `Esta rotina costuma exigir ${DIMENSION_ACTIVITIES[dim]}. Vale testar como você se sente fazendo isso.`;
  }
  return c.attention;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export type PreviewSummary = {
  topDimensions: { id: Dimension; label: string }[];
  explanation: string;
  broadProfile: boolean;
};

export function buildPreview(answers: Answers): PreviewSummary {
  const u = userVector(answers);
  const broad = isBroadProfile(answers, u);
  const [a, b] = topDims(u, 2);
  const explanation = broad
    ? 'Suas respostas mostram interesses variados, sem uma preferência que se destaque muito das outras. Isso é comum e significa que vale experimentar mais de um tipo de atividade antes de escolher.'
    : `Suas respostas mostram mais interesse por atividades de ${DIMENSION_LABELS[a]} e de ${DIMENSION_LABELS[b]}. Isso indica tarefas que tendem a te dar mais energia, não uma medida de aptidão.`;
  return {
    topDimensions: [a, b].map((id) => ({ id, label: DIMENSION_LABELS[id] })),
    explanation,
    broadProfile: broad,
  };
}

// ---------- evidências tiradas das próprias respostas (nada inventado) ----------

const scaleLabel = (n: number) => SCALE.find((x) => x.value === n)?.label ?? String(n);
const quote = (q: { text: string }, n: number) => `Você marcou “${scaleLabel(n)}” em “${q.text.replace(/\.$/, '')}”`;

/** Dimensões que a carreira mais exige (vetor ≥ 4), da mais para a menos exigida. */
function demandedDims(c: Career): Dimension[] {
  return [...DIMENSIONS].filter((d) => c.vector[d] >= 4).sort((a, b) => c.vector[b] - c.vector[a] || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b));
}

/**
 * Até duas frases que a pessoa marcou alto (4–5) nas atividades centrais da carreira, de áreas diferentes
 * quando possível. Entre respostas iguais, prefere as perguntas que melhor representam a carreira.
 */
export function evidenceFor(answers: Answers, c: Career, used: Set<string> = new Set()): string[] {
  const dims = demandedDims(c);
  const hint = (id: string) => {
    const i = c.evidenceHints?.indexOf(id) ?? -1;
    return i === -1 ? 99 : i;
  };
  // Frases já citadas em caminhos acima vão para o fim da fila, para cada caminho trazer motivos próprios.
  const high = QUESTIONS.filter((q) => dims.includes(q.dimension) && (answers[q.id] ?? 0) >= 4)
    .sort((x, y) => Number(used.has(x.id)) - Number(used.has(y.id)) || answers[y.id]! - answers[x.id]! || hint(x.id) - hint(y.id) || dims.indexOf(x.dimension) - dims.indexOf(y.dimension));
  const picks: typeof high = [];
  for (const q of high) if (picks.length < 2 && !picks.some((p) => p.dimension === q.dimension)) picks.push(q);
  for (const q of high) if (picks.length < 2 && !picks.includes(q)) picks.push(q);
  for (const q of picks) used.add(q.id);
  return picks.map((q) => quote(q, answers[q.id]!));
}

/** Uma frase que a pessoa marcou baixo (1–2) em algo que a carreira exige bastante. */
export function tensionFor(answers: Answers, c: Career): string | null {
  const dims = demandedDims(c);
  const q = QUESTIONS.filter((x) => dims.includes(x.dimension) && (answers[x.id] ?? 5) <= 2)
    .sort((a, b) => answers[a.id]! - answers[b.id]! || dims.indexOf(a.dimension) - dims.indexOf(b.dimension))[0];
  return q ? `${quote(q, answers[q.id]!)}, e esta rotina pede isso com frequência. Vale testar essa parte com atenção no plano.` : null;
}

export type ProfileBar = { id: Dimension; label: string; score: number };
export type LeftOut = { name: string; reason: string };

export type MapCard = {
  careerId: string;
  position: number;
  name: string;
  /** Afinidade 0–100 (scoring-v2). Ausente em mapas antigos. */
  match?: number;
  /** Atividade que a carreira mais exige (ícone do card). */
  dim?: Dimension;
  /** Respostas da própria pessoa que sustentam a sugestão. */
  evidence?: string[];
  /** Resposta baixa da pessoa em algo que a carreira exige. */
  tension?: string | null;
  reasons: string[];
  routine: string;
  attention: string;
  firstStep: string;
  skill: string;
  miniActivity: string;
  search: string;
  entry: string;
  days: string[];
};

export type ResultSnapshot = {
  resultVersion: string;
  contentVersion: string;
  broadProfile: boolean;
  summary: PreviewSummary;
  context: QuizContext;
  /** Perfil da pessoa nas 6 dimensões (0–100), do maior para o menor. Ausente em mapas antigos. */
  profile?: ProfileBar[];
  cards: MapCard[];
  /** Os dois caminhos menos compatíveis e o porquê, a partir das respostas. */
  leftOut?: LeftOut[];
  common: {
    professionalMessage: string;
    howToEnter: string;
    noProfessionalFallback: string;
    safetyNote: string;
    timeExtension: string | null;
  };
};

export type ComputedResult = {
  scores: { user: UserVector; ranking: RankedCareer[] };
  rankedCareerIds: string[];
  snapshot: ResultSnapshot;
};

export function computeResult(answers: Answers, context: QuizContext): ComputedResult {
  const u = userVector(answers);
  const ranking = rankCareers(u);
  const top = ranking.slice(0, 5);
  const broad = isBroadProfile(answers, u);
  const moment = context.moment ?? 'explore';

  const quoted = new Set<string>();
  const cards: MapCard[] = top.map((r, i) => {
    const c = CAREERS.find((x) => x.id === r.id)!;
    const [d1, d2] = reasonDims(u, c);
    return {
      careerId: c.id,
      position: i + 1,
      name: c.name,
      match: Math.round(r.affinity),
      dim: demandedDims(c)[0] ?? topDims(careerVector(c), 1)[0],
      evidence: evidenceFor(answers, c, quoted),
      tension: tensionFor(answers, c),
      reasons: [
        `${REASON_PHRASES[d1]}. Essa rotina envolve ${lowerFirst(c.routine)}`,
        `${REASON_PHRASES[d2]}, algo presente no dia a dia de quem trabalha com ${lowerFirst(c.name)}.`,
      ],
      routine: c.routine,
      attention: attentionText(u, c),
      firstStep: c.days[0],
      skill: c.skill,
      // Miniatividade prática: a simulação central do plano (dia 5).
      miniActivity: c.days[4],
      search: c.search,
      entry: `${MOMENT_ENTRY[moment]} ${SAFETY_NOTE}`,
      days: [...c.days],
    };
  });

  const profile: ProfileBar[] = topDims(u, 6).map((id) => ({ id, label: DIMENSION_LABELS[id], score: Math.round(u[id] * 100) }));
  const usedGap = new Set<Dimension>();
  const leftOut: LeftOut[] = ranking.slice(-2).reverse().map((r) => {
    const c = CAREERS.find((x) => x.id === r.id)!;
    const gaps = {} as Record<Dimension, number>;
    for (const d of DIMENSIONS) gaps[d] = careerVector(c)[d] - u[d];
    // Evita repetir a mesma explicação nos dois caminhos.
    const d = topDims(gaps, 6).find((x) => gaps[x] > 0.25 && !usedGap.has(x));
    if (!d) return { name: c.name, reason: 'O formato das suas preferências combina menos com a rotina deste caminho.' };
    usedGap.add(d);
    return { name: c.name, reason: `Pede ${DIMENSION_ACTIVITIES[d]}, e suas respostas nessa parte ficaram entre as mais baixas.` };
  });

  const dailyTime = context.dailyTime ?? 15;
  return {
    scores: { user: u, ranking },
    rankedCareerIds: top.map((r) => r.id),
    snapshot: {
      resultVersion: RESULT_VERSION,
      contentVersion: CONTENT_VERSION,
      broadProfile: broad,
      summary: buildPreview(answers),
      context: { moment: context.moment, dailyTime: context.dailyTime, currentArea: context.currentArea },
      profile,
      cards,
      leftOut,
      common: {
        professionalMessage: PROFESSIONAL_MESSAGE,
        howToEnter: HOW_TO_ENTER,
        noProfessionalFallback: NO_PROFESSIONAL_FALLBACK,
        safetyNote: SAFETY_NOTE,
        timeExtension: dailyTime === 15 ? null : TIME_EXTENSIONS[dailyTime],
      },
    },
  };
}
