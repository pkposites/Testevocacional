// Cálculo determinístico da especificação v1. Heurística editorial: não representa chance de sucesso.
import { DIMENSIONS, DIMENSION_LABELS, QUESTIONS, type Answers, type Dimension, type QuizContext } from '../shared/quiz';
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
  for (const dim of DIMENSIONS) out[dim] = c.vector[dim] / 5;
  return out;
}

export function affinity(u: UserVector, v: UserVector): number {
  const distance = DIMENSIONS.reduce((s, d) => s + Math.abs(u[d] - v[d]), 0) / 6;
  // Arredonda para que afinidades matematicamente iguais empatem de fato (ruído de ponto flutuante).
  return Math.round(100 * (1 - distance) * 1e9) / 1e9;
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

export type MapCard = {
  careerId: string;
  position: number;
  name: string;
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
  cards: MapCard[];
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

  const cards: MapCard[] = top.map((r, i) => {
    const c = CAREERS.find((x) => x.id === r.id)!;
    const [d1, d2] = reasonDims(u, c);
    return {
      careerId: c.id,
      position: i + 1,
      name: c.name,
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
      cards,
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
