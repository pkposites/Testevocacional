// Catálogo pago — somente servidor. Conteúdo da especificação v1.0 (1/out/2026).
// Vetores editoriais P, A, C, S, N, O de 1 a 5. Não representam chance de sucesso.
import type { Dimension } from '../../shared/quiz';

export const CONTENT_VERSION = 'content-v1';
export const RESULT_VERSION = 'scoring-v1';

export type Career = {
  id: string;
  name: string;
  vector: Record<Dimension, number>;
  routine: string; // rotina resumida
  attention: string; // ponto de atenção editorial
  skill: string; // habilidade inicial
  search: string; // termo de pesquisa (sem links inventados)
  days: [string, string, string, string, string, string, string];
};

const v = (P: number, A: number, C: number, S: number, N: number, O: number) => ({ P, A, C, S, N, O });

export const CAREERS: Career[] = [
  {
    id: '01', name: 'Gestão de tráfego', vector: v(1, 5, 3, 2, 3, 4),
    routine: 'Planejar anúncios e analisar resultados.',
    attention: 'Cobrança por desempenho e mudanças nas plataformas.',
    skill: 'Relacionar oferta, público e métricas.',
    search: 'fundamentos de tráfego pago Meta Ads Google Ads',
    days: [
      'Escolha um negócio fictício e uma oferta.',
      'Descreva quem compraria e por quê.',
      'Veja uma introdução oficial a anúncios.',
      'Escreva um anúncio e seu destino.',
      'Desenhe uma campanha sem publicar.',
      'Peça feedback ou procure relato de rotina.',
      'Revise a campanha e registre se gostou do processo.',
    ],
  },
  {
    id: '02', name: 'Análise de dados', vector: v(1, 5, 2, 2, 1, 5),
    routine: 'Limpar informações e apoiar decisões.',
    attention: 'Conferência e tarefas repetitivas.',
    skill: 'Tabelas, filtros e perguntas de negócio.',
    search: 'introdução análise de dados planilhas',
    days: [
      'Escolha uma pergunta sobre gastos fictícios.',
      'Monte dez registros em uma planilha.',
      'Confira categorias e valores.',
      'Use soma e filtro para comparar.',
      'Crie um gráfico e uma conclusão.',
      'Leia relato de rotina ou converse com analista.',
      'Explique sua conclusão em três linhas.',
    ],
  },
  {
    id: '03', name: 'Desenvolvimento web', vector: v(2, 5, 4, 1, 1, 4),
    routine: 'Construir e corrigir páginas e sistemas.',
    attention: 'Erros e aprendizado contínuo.',
    skill: 'Lógica e HTML.',
    search: 'MDN primeiros passos desenvolvimento web',
    days: [
      'Escolha uma página simples para reproduzir.',
      'Veja uma introdução ao HTML.',
      'Crie um título e um parágrafo.',
      'Adicione um botão e estilo básico.',
      'Corrija um erro e teste no celular.',
      'Pergunte a um desenvolvedor sobre sua rotina.',
      'Mostre a página e reflita sobre o processo.',
    ],
  },
  {
    id: '04', name: 'Design gráfico', vector: v(2, 2, 5, 2, 2, 3),
    routine: 'Transformar mensagens em peças visuais.',
    attention: 'Revisões e limites de briefing.',
    skill: 'Hierarquia, contraste e legibilidade.',
    search: 'princípios de design gráfico hierarquia visual',
    days: [
      'Escolha um cartaz fictício e seu objetivo.',
      'Observe três referências e anote diferenças.',
      'Estude hierarquia e contraste.',
      'Crie uma primeira versão em ferramenta gratuita.',
      'Revise tamanho e clareza dos textos.',
      'Peça feedback sobre a mensagem.',
      'Faça uma segunda versão e avalie sua experiência.',
    ],
  },
  {
    id: '05', name: 'Produção de conteúdo', vector: v(2, 2, 5, 3, 4, 3),
    routine: 'Pesquisar, escrever e produzir materiais.',
    attention: 'Prazos e revisão frequente.',
    skill: 'Roteiro com começo, desenvolvimento e ação.',
    search: 'roteiro de vídeo curto conteúdo',
    days: [
      'Escolha um tema que conhece.',
      'Defina público e uma pergunta a responder.',
      'Escreva um roteiro de até um minuto.',
      'Grave uma versão sem precisar publicar.',
      'Edite cortes e revise a mensagem.',
      'Mostre a alguém e pergunte o que entendeu.',
      'Ajuste o roteiro e decida se quer repetir.',
    ],
  },
  {
    id: '06', name: 'Vendas consultivas', vector: v(1, 3, 2, 4, 5, 3),
    routine: 'Entender necessidades e apresentar soluções.',
    attention: 'Rejeição e metas.',
    skill: 'Escuta e perguntas de diagnóstico.',
    search: 'vendas consultivas perguntas diagnóstico',
    days: [
      'Escolha um produto conhecido.',
      'Anote três problemas que ele resolve.',
      'Crie cinco perguntas para entender o cliente.',
      'Simule uma conversa com alguém.',
      'Escreva uma proposta simples.',
      'Converse com vendedor sobre objeções reais.',
      'Repita a simulação e registre o que sentiu.',
    ],
  },
  {
    id: '07', name: 'Operações administrativas', vector: v(2, 3, 1, 3, 2, 5),
    routine: 'Organizar registros, agenda e processos.',
    attention: 'Repetição e responsabilidade com detalhes.',
    skill: 'Planilhas e controle de prazos.',
    search: 'rotina assistente administrativo',
    days: [
      'Escolha uma rotina fictícia de escritório.',
      'Liste tarefas e responsáveis.',
      'Monte uma planilha de acompanhamento.',
      'Defina prioridades e prazos.',
      'Confira dados e procure inconsistências.',
      'Pergunte a alguém da área sobre o dia a dia.',
      'Melhore o processo e avalie sua disposição.',
    ],
  },
  {
    id: '08', name: 'Coordenação de projetos', vector: v(1, 4, 2, 4, 4, 5),
    routine: 'Organizar entregas, pessoas e dependências.',
    attention: 'Conflitos e mudanças de prazo.',
    skill: 'Decompor uma entrega em tarefas.',
    search: 'fundamentos gestão de projetos',
    days: [
      'Escolha um pequeno projeto pessoal.',
      'Defina resultado e prazo.',
      'Liste tarefas e dependências.',
      'Monte um quadro de acompanhamento.',
      'Simule um atraso e ajuste o plano.',
      'Pergunte sobre rotina a alguém da área.',
      'Apresente o plano e registre o que gostou.',
    ],
  },
  {
    id: '09', name: 'Recrutamento e seleção', vector: v(1, 3, 2, 5, 3, 4),
    routine: 'Organizar busca e avaliação de candidatos.',
    attention: 'Decisões difíceis e sigilo.',
    skill: 'Critérios objetivos e entrevista estruturada.',
    search: 'introdução recrutamento seleção',
    days: [
      'Escolha uma vaga fictícia.',
      'Separe requisitos essenciais e desejáveis.',
      'Crie cinco perguntas ligadas às tarefas.',
      'Monte três perfis inteiramente fictícios.',
      'Compare perfis sem usar características pessoais.',
      'Converse com alguém de RH sobre formação e rotina.',
      'Revise critérios e reflita sobre a atividade.',
    ],
  },
  {
    id: '10', name: 'Educação e formação', vector: v(2, 3, 4, 5, 2, 4),
    routine: 'Preparar explicações e apoiar aprendizagem.',
    attention: 'Adaptar linguagem e lidar com diferentes ritmos.',
    skill: 'Explicar um conceito com exercício.',
    search: 'planejamento de aula introdutória',
    days: [
      'Escolha algo simples que sabe ensinar.',
      'Defina o que a pessoa deve conseguir fazer.',
      'Crie uma explicação de cinco minutos.',
      'Prepare um exemplo e um exercício.',
      'Ensine a uma pessoa que aceite participar.',
      'Peça feedback e pesquise formação da função desejada.',
      'Refaça uma explicação e avalie seu interesse.',
    ],
  },
  {
    id: '11', name: 'Logística', vector: v(4, 4, 1, 2, 2, 5),
    routine: 'Organizar fluxos de estoque e entregas.',
    attention: 'Imprevistos e pressão operacional.',
    skill: 'Sequenciar tarefas e controlar estoque.',
    search: 'fundamentos logística estoque',
    days: [
      'Crie cinco pedidos fictícios.',
      'Monte uma lista de produtos e estoque.',
      'Organize separação e entrega.',
      'Simule falta de um item e resolva.',
      'Compare duas ordens de atendimento.',
      'Leia relato ou converse com profissional de logística.',
      'Revise o fluxo e registre sua experiência.',
    ],
  },
  {
    id: '12', name: 'Manutenção e suporte técnico', vector: v(5, 4, 2, 3, 1, 4),
    routine: 'Investigar falhas e orientar soluções.',
    attention: 'Paciência, procedimentos e limites de segurança.',
    skill: 'Diagnóstico por etapas.',
    search: 'suporte técnico diagnóstico básico',
    days: [
      'Escolha um problema simples de software.',
      'Descreva sintomas sem alterar o equipamento.',
      'Liste hipóteses e verificações seguras.',
      'Consulte documentação ou manual oficial.',
      'Escreva um roteiro de solução reversível.',
      'Pergunte a um técnico sobre rotina e formação.',
      'Revise o roteiro e avalie se gostou de investigar.',
    ],
  },
];

// Textos fixos usados na entrega.
export const REASON_PHRASES: Record<Dimension, string> = {
  P: 'Você demonstrou interesse em tarefas práticas',
  A: 'Você gosta de investigar e comparar informações',
  C: 'Você se interessa por criar e experimentar',
  S: 'Você valoriza troca e colaboração',
  N: 'Você se interessa por iniciativa e negociação',
  O: 'Você gosta de processos e organização',
};

// Atividade usada em "Esta rotina costuma exigir [atividade]".
export const DIMENSION_ACTIVITIES: Record<Dimension, string> = {
  P: 'tarefas práticas, de montar e ajustar coisas',
  A: 'investigar e comparar informações',
  C: 'criar e experimentar novas formas de fazer',
  S: 'bastante troca e colaboração com pessoas',
  N: 'negociar e tomar a iniciativa',
  O: 'seguir processos e conferir detalhes',
};

export const PROFESSIONAL_MESSAGE =
  'Estou explorando sua área. Você teria dez minutos para me contar como é um dia normal, qual tarefa ocupa mais tempo, o que costuma frustrar quem começa e que pequena experiência eu poderia fazer antes de investir em formação?';

export const HOW_TO_ENTER =
  'Após a experiência, pesquise três oportunidades reais do caminho escolhido, anote habilidades e formação recorrentes e defina uma próxima experiência. Para funções que exigem formação específica, verifique requisitos antes de atuar. Estas atividades são simulações: não execute serviço para cliente nem intervenção elétrica, de gás ou em equipamento de risco.';

export const NO_PROFESSIONAL_FALLBACK =
  'Se não conseguir falar com um profissional, leia um relato de rotina da área e mantenha a conversa como próximo passo.';

export const TIME_EXTENSIONS: Record<30 | 60, string> = {
  30: 'Com 30 minutos: repita a tarefa com outro exemplo.',
  60: 'Com 60 minutos: amplie a miniatividade e registre o que aprendeu.',
};

export const MOMENT_ENTRY: Record<'first' | 'change' | 'explore', string> = {
  first: 'Como você está escolhendo sua primeira área, priorize uma amostra de trabalho, pesquise a formação pedida e converse com alguém da área sobre como entrou.',
  change: 'Como você quer mudar de área, escolha uma habilidade que já usa hoje e que pode servir aqui, e faça a experiência em paralelo à sua rotina atual.',
  explore: 'Como você quer explorar sem sair da área atual, reserve uma pequena tarefa por semana para manter a experiência viva.',
};

export const SAFETY_NOTE =
  'Comece sem abandonar emprego ou faculdade e sem contratar curso caro apenas por este resultado.';
