// Diagnóstico pago: plano de 4 semanas montado de forma determinística a partir das respostas,
// do contexto e do catálogo. Nada é inventado: cursos viram termos de busca + critérios de escolha.
import { DIMENSIONS, DIMENSION_LABELS, type Answers, type Dimension, type QuizContext } from '../shared/quiz';
import { CAREERS, DIMENSION_ACTIVITIES, type Career } from './content/careers.v1';
import {
  AREA_KEYWORDS, CAREER_DIAGNOSTICS, COURSE_CHECKLIST, COURSE_RED_FLAGS, DIAGNOSTIC_VERSION,
  DIM_MITIGATION, DIM_STRENGTH, DIM_TRANSFER,
} from './content/diagnostic.v1';
import { careerVector, demandedDims, evidenceFor, tensionFor, topDims, userVector, type ResultSnapshot } from './scoring';

export type DiagnosticWeek = { week: number; title: string; goal: string; tasks: string[] };

export type Diagnostic = {
  version: string;
  career: { id: string; name: string; match?: number; dim?: Dimension };
  headline: string;
  why: string[];
  hoursTotal: number;
  minutesPerDay: number;
  /** Primeiro passo para hoje, antes de pagar qualquer curso. */
  today: { activity: string; routine: string; requirement: string };
  formation: { path: 'livre' | 'tecnico' | 'regulada'; text: string; courseTerms: string[]; checklist: string[]; redFlags: string[]; warning: string | null };
  experience: { area: string | null; carries: string[]; text: string };
  strengths: string[];
  attention: { point: string; plan: string }[];
  weeks: DiagnosticWeek[];
  proof: string;
  firstJobs: string[];
  talk: { who: string; questions: string[] };
  compare: { other: string; chooseThis: string; chooseOther: string; recommendation: string } | null;
  closing: string;
};

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const noDot = (s: string) => s.replace(/\.$/, '');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function areaDims(area: string | undefined): Dimension[] {
  if (!area) return [];
  const a = norm(area);
  const out: Dimension[] = [];
  for (const k of AREA_KEYWORDS) if (k.re.test(a)) for (const d of k.dims) if (!out.includes(d)) out.push(d);
  return out;
}

/** Tarefas por semana conforme o tempo diário (15 → 3, 30 → 4, 60 → 5). */
function take(tasks: string[], minutes: number) {
  const n = minutes >= 60 ? 5 : minutes >= 30 ? 4 : 3;
  return tasks.slice(0, n);
}

export function buildDiagnostic(snapshot: ResultSnapshot, answers: Answers, careerId?: string): Diagnostic {
  const ctx: QuizContext = snapshot.context ?? {};
  const cards = snapshot.cards;
  const card = cards.find((c) => c.careerId === careerId) ?? cards[0];
  const c: Career = CAREERS.find((x) => x.id === card.careerId)!;
  const d = CAREER_DIAGNOSTICS[c.id];
  const u = userVector(answers);
  const v = careerVector(c);
  const demanded = demandedDims(c);
  const minutes = ctx.dailyTime ?? 15;
  const moment = ctx.moment ?? 'explore';
  const area = ctx.currentArea?.trim() || null;

  // Por que este caminho: as respostas da própria pessoa.
  const why = evidenceFor(answers, c);
  if (why.length === 0) why.push(`Seu perfil tem um formato parecido com o que ${c.name} pede no dia a dia: ${lower(noDot(c.routine))}.`);

  // Pontos fortes: atividades que a carreira exige e a pessoa marcou alto.
  const strong = demanded.filter((x) => u[x] >= 0.625);
  const strongDims = (strong.length ? strong : topDims(u, 2)).slice(0, 2);
  const strengths = strongDims.map((x) => DIM_STRENGTH[x]);

  // Pontos de atenção: atividades que a carreira exige e a pessoa marcou baixo.
  const gaps = DIMENSIONS.filter((x) => v[x] - u[x] > 0.25).sort((a, b) => (v[b] - u[b]) - (v[a] - u[a])).slice(0, 2);
  const attention = gaps.map((x) => ({
    point: `${c.name} costuma exigir ${DIMENSION_ACTIVITIES[x]}, e essa foi uma das partes que você marcou mais baixo.`,
    plan: DIM_MITIGATION[x],
  }));
  const tension = tensionFor(answers, c);
  if (attention.length === 0) {
    attention.push({ point: noDot(c.attention) + '.', plan: 'Na semana 1, preste atenção especial a este ponto e anote como você se sentiu.' });
  } else if (tension) {
    attention[0].point = tension.replace(/ Vale testar.*$/, '');
  }

  // Experiência atual.
  const carriesDims = areaDims(area ?? undefined).filter((x) => demanded.includes(x) || v[x] >= 0.5);
  const carries = carriesDims.map((x) => DIM_TRANSFER[x]);
  const expText = area
    ? carries.length
      ? `Da sua experiência em “${area}”, você já leva ${carries.join(' e ')}, que ${c.name} usa no dia a dia. Coloque isso em primeiro lugar no currículo e nas conversas.`
      : `Liste 3 situações do seu trabalho em “${area}” em que você precisou de ${DIMENSION_ACTIVITIES[demanded[0] ?? topDims(v, 1)[0]]}. Elas viram exemplos concretos no currículo e nas conversas.`
    : moment === 'first'
      ? 'Como é sua primeira área, sua experiência vai ser a prova que você constrói na semana 3. Ela vale mais que um currículo vazio.'
      : `Pense em 3 situações (estudo, trabalho ou vida pessoal) em que você precisou de ${DIMENSION_ACTIVITIES[demanded[0] ?? topDims(v, 1)[0]]}. Elas viram exemplos concretos nas conversas.`;

  const regulated = d.path === 'regulada';
  const momentGoal =
    moment === 'change'
      ? 'Decidir com dados se vale planejar a mudança, sem largar sua renda atual antes da hora.'
      : moment === 'first'
        ? 'Sair com uma decisão clara sobre a formação e uma primeira prova do que você sabe fazer.'
        : 'Testar este caminho em paralelo à sua rotina e decidir se ele merece mais espaço.';

  const weeks: DiagnosticWeek[] = [
    {
      week: 1,
      title: 'Experimentar a rotina',
      goal: 'Sentir na prática como é o trabalho antes de gastar com curso.',
      tasks: take([
        `Faça os dias 1 a 3 do plano de 7 dias do seu mapa: ${lower(noDot(c.days[0]))}; ${lower(noDot(c.days[1]))}; ${lower(noDot(c.days[2]))}.`,
        `Faça a miniatividade central: ${lower(noDot(c.days[4]))}.`,
        `Pesquise “${c.search}” e anote 3 coisas que se repetem no dia a dia de quem trabalha com isso.`,
        `No fim da semana, dê uma nota de 1 a 5 para o quanto você gostou de fazer as tarefas, não do resultado.`,
        `Pratique a habilidade de base por pelo menos 2 sessões: ${lower(noDot(c.skill))}.`,
      ], minutes),
    },
    {
      week: 2,
      title: regulated ? 'Entender a formação exigida' : 'Escolher como aprender',
      goal: regulated ? 'Saber exatamente qual formação é obrigatória e quanto tempo e dinheiro ela pede.' : 'Escolher um curso (de preferência gratuito para começar) com critério.',
      tasks: take([
        `Pesquise: ${d.courseTerms.map((t) => `“${t}”`).join(', ')}.`,
        'Compare 3 opções com o checklist de escolha de curso abaixo e descarte as que tiverem sinal de alerta.',
        regulated ? 'Anote duração, modalidade, custo total e se é reconhecida (e-MEC ou SISTEC) para cada opção.' : 'Comece a opção escolhida e faça as primeiras aulas práticas.',
        `Escreva em uma frase o que você quer saber fazer ao fim do mês em ${c.name}.`,
        'Reserve no calendário os horários das próximas 2 semanas.',
      ], minutes),
    },
    {
      week: 3,
      title: 'Construir sua prova',
      goal: 'Ter algo concreto para mostrar, que fala por você.',
      tasks: take([
        `Comece a prova do mês: ${lower(noDot(d.proof))}.`,
        'Divida a prova em 3 partes e faça uma por sessão.',
        'Mostre o resultado parcial para alguém e peça uma crítica sincera.',
        'Ajuste o que a pessoa apontou e registre o antes e depois.',
        'Guarde tudo em um só lugar (pasta, drive ou perfil) para mostrar na semana 4.',
      ], minutes),
    },
    {
      week: 4,
      title: 'Falar com o mercado e decidir',
      goal: momentGoal,
      tasks: take([
        `Converse com ${d.talkTo} (LinkedIn, Instagram ou indicação de conhecidos).`,
        `Procure vagas ou oportunidades com estes termos: ${d.firstJobs.map((j) => `“${j}”`).join(', ')}. Anote o que se repete nos requisitos.`,
        'Compare os requisitos com o que você já tem e liste no máximo 3 lacunas.',
        moment === 'change'
          ? 'Defina por quanto tempo você continuaria testando em paralelo antes de decidir a mudança.'
          : moment === 'first'
            ? 'Decida a formação para os próximos meses com base no que ouviu.'
            : 'Decida quantas horas por semana este caminho merece nos próximos meses.',
        'Escreva sua decisão: continuar, ajustar o foco ou testar o próximo caminho do mapa.',
      ], minutes),
    },
  ];

  // Comparação com o segundo caminho.
  const second = cards.find((x) => x.careerId !== c.id);
  let compare: Diagnostic['compare'] = null;
  if (second) {
    const c2 = CAREERS.find((x) => x.id === second.careerId)!;
    const v2 = careerVector(c2);
    const diff = {} as Record<Dimension, number>;
    const diff2 = {} as Record<Dimension, number>;
    for (const x of DIMENSIONS) { diff[x] = v[x] - v2[x]; diff2[x] = v2[x] - v[x]; }
    const [a] = topDims(diff, 1);
    const [b] = topDims(diff2, 1);
    const d2 = CAREER_DIAGNOSTICS[c2.id];
    const m1 = card.match ?? 0;
    const m2 = second.match ?? 0;
    let rec = `Comece por ${c.name}: ele ficou com afinidade maior com as suas respostas.`;
    if (Math.abs(m1 - m2) <= 3) rec = `Os dois ficaram bem próximos. Faça a semana 1 deste plano e, na semana seguinte, os 3 primeiros dias de ${c2.name} no seu mapa; continue com o que deu mais vontade de repetir.`;
    if (regulated && d2.path !== 'regulada' && m1 - m2 <= 5) rec += ` Como ${c2.name} não exige diploma para começar, ele pode ser um teste mais rápido enquanto você avalia a formação de ${c.name}.`;
    compare = {
      other: c2.name,
      chooseThis: `${c.name} pede mais ${DIMENSION_ACTIVITIES[a]}. Escolha este se foi isso que mais te animou nas tarefas.`,
      chooseOther: `${c2.name} pede mais ${DIMENSION_ACTIVITIES[b]}. Prefira este se essa parte te dá mais energia.`,
      recommendation: rec,
    };
  }

  const firstName = DIMENSION_LABELS[topDims(u, 1)[0]];
  return {
    version: DIAGNOSTIC_VERSION,
    career: { id: c.id, name: c.name, match: card.match, dim: card.dim },
    headline: `Um plano de 4 semanas para testar ${c.name} de verdade, no seu ritmo de ${minutes} minutos por dia.`,
    why,
    hoursTotal: Math.round((minutes * 5 * 4) / 60),
    minutesPerDay: minutes,
    today: {
      activity: `Faça esta atividade: ${lower(noDot(c.days[4]))}.`,
      routine: `Conheça a rotina: pesquise “${c.search}” e veja como é um dia de trabalho.`,
      requirement: `Confira o requisito para começar: ${lower(d.formation.split('. ')[0].replace(/\.$/, ''))}.`,
    },
    formation: {
      path: d.path,
      text: d.formation,
      courseTerms: d.courseTerms,
      checklist: COURSE_CHECKLIST,
      redFlags: COURSE_RED_FLAGS,
      warning: d.courseWarning ?? null,
    },
    experience: { area, carries, text: expText },
    strengths,
    attention,
    weeks,
    proof: d.proof,
    firstJobs: d.firstJobs,
    talk: {
      who: d.talkTo,
      questions: [
        'Como é um dia normal no seu trabalho, do começo ao fim?',
        d.talkQuestion,
        'Se você estivesse começando hoje, o que faria primeiro e o que evitaria?',
      ],
    },
    compare,
    closing: `Seu perfil puxa para ${firstName}. Este plano não mede talento nem garante resultado: ele serve para você testar com pouco risco e decidir com informação real.`,
  };
}
