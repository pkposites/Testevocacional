// Conteúdo público do teste. Este arquivo vai para o navegador: não colocar aqui
// ranking, catálogo de caminhos ou planos pagos (ficam em server/content).

export const QUIZ_VERSION = 'quiz-v1';

export type Dimension = 'P' | 'A' | 'C' | 'S' | 'N' | 'O';
export const DIMENSIONS: Dimension[] = ['P', 'A', 'C', 'S', 'N', 'O'];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  P: 'prática',
  A: 'análise',
  C: 'criação',
  S: 'colaboração',
  N: 'negociação e iniciativa',
  O: 'organização',
};

export const QUESTIONS: { id: string; text: string; dimension: Dimension }[] = [
  { id: 'Q01', text: 'Gosto de montar, ajustar ou consertar coisas.', dimension: 'P' },
  { id: 'Q02', text: 'Tenho vontade de entender por que algo acontece antes de decidir.', dimension: 'A' },
  { id: 'Q03', text: 'Gosto de criar imagens, textos ou novas formas de apresentar uma ideia.', dimension: 'C' },
  { id: 'Q04', text: 'Gosto de ouvir alguém e ajudar essa pessoa a aprender ou resolver uma dificuldade.', dimension: 'S' },
  { id: 'Q05', text: 'Gosto de apresentar ideias e convencer pessoas a participar de um projeto.', dimension: 'N' },
  { id: 'Q06', text: 'Gosto de organizar tarefas, documentos e prazos.', dimension: 'O' },
  { id: 'Q07', text: 'Prefiro atividades em que consigo ver algo concreto funcionando ao final.', dimension: 'P' },
  { id: 'Q08', text: 'Gosto de comparar informações ou números para encontrar uma resposta.', dimension: 'A' },
  { id: 'Q09', text: 'Gosto de experimentar soluções diferentes, mesmo quando não há um modelo pronto.', dimension: 'C' },
  { id: 'Q10', text: 'Uma rotina com bastante troca e colaboração com pessoas me interessa.', dimension: 'S' },
  { id: 'Q11', text: 'Tenho interesse em negociar e tomar a iniciativa em projetos.', dimension: 'N' },
  { id: 'Q12', text: 'Sinto satisfação ao seguir um processo e conferir se tudo ficou correto.', dimension: 'O' },
];

export const SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Nada a ver comigo' },
  { value: 2, label: 'Pouco a ver' },
  { value: 3, label: 'Mais ou menos' },
  { value: 4, label: 'Bastante a ver' },
  { value: 5, label: 'Muito a ver comigo' },
];

export type Moment = 'first' | 'change' | 'explore';
export const MOMENTS: { value: Moment; label: string }[] = [
  { value: 'first', label: 'Escolhendo minha primeira área' },
  { value: 'change', label: 'Quero mudar de área' },
  { value: 'explore', label: 'Quero explorar outra possibilidade sem sair da atual' },
];

export type DailyTime = 15 | 30 | 60;
export const DAILY_TIMES: { value: DailyTime; label: string }[] = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '60 minutos' },
];

export const CURRENT_AREA_MAX = 80;

export type Answers = Partial<Record<string, number>>;
export type QuizContext = { moment?: Moment; dailyTime?: DailyTime; currentArea?: string };

export function isCompleteAnswers(a: Answers): boolean {
  return QUESTIONS.every((q) => Number.isInteger(a[q.id]) && a[q.id]! >= 1 && a[q.id]! <= 5);
}

export function isCompleteContext(c: QuizContext): boolean {
  return !!c.moment && MOMENTS.some((m) => m.value === c.moment) && DAILY_TIMES.some((t) => t.value === c.dailyTime);
}
