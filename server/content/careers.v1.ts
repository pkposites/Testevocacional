// Catálogo pago — somente servidor. Conteúdo da especificação v1.0 (1/out/2026).
// Vetores editoriais P, A, C, S, N, O de 1 a 5. Não representam chance de sucesso.
import type { Dimension } from '../../shared/quiz';

export const CONTENT_VERSION = 'content-v2';
export const RESULT_VERSION = 'scoring-v2';

export type Career = {
  id: string;
  name: string;
  vector: Record<Dimension, number>;
  routine: string; // rotina resumida
  attention: string; // ponto de atenção editorial
  skill: string; // habilidade inicial
  search: string; // termo de pesquisa (sem links inventados)
  days: [string, string, string, string, string, string, string];
  /** Perguntas que melhor representam a carreira: só escolhem qual resposta citar, não entram no cálculo. */
  evidenceHints?: string[];
};

const v = (P: number, A: number, C: number, S: number, N: number, O: number) => ({ P, A, C, S, N, O });

export const CAREERS: Career[] = [
  {
    id: '01', name: 'Gestão de tráfego', vector: v(1, 5, 3, 2, 3, 4),
    evidenceHints: ['Q08', 'Q14'],
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
    evidenceHints: ['Q08', 'Q12'],
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
    evidenceHints: ['Q14', 'Q09'],
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
    evidenceHints: ['Q15', 'Q03'],
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
    evidenceHints: ['Q03', 'Q05'],
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
    evidenceHints: ['Q17', 'Q05'],
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
    evidenceHints: ['Q06', 'Q12'],
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
    evidenceHints: ['Q18', 'Q11'],
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
    evidenceHints: ['Q04', 'Q10'],
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
    evidenceHints: ['Q04', 'Q16'],
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
    evidenceHints: ['Q06', 'Q07', 'Q18'],
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
    evidenceHints: ['Q01', 'Q14'],
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
  // ---------- catálogo v2: 12 caminhos novos, escolhidos para cobrir perfis sem caminho próprio ----------
  {
    id: '13', name: 'UX/UI design', vector: v(1, 4, 5, 3, 1, 3),
    evidenceHints: ['Q15', 'Q14', 'Q04'],
    routine: 'Entender como as pessoas usam um app ou site e desenhar telas mais fáceis.',
    attention: 'Mudanças frequentes de opinião e necessidade de justificar decisões.',
    skill: 'Observar usuários e organizar uma tela por prioridade.',
    search: 'introdução UX design pesquisa com usuários',
    days: [
      'Escolha um app que você usa e uma tarefa nele (ex.: pagar uma conta).',
      'Faça a tarefa e anote cada passo que confundiu você.',
      'Peça a uma pessoa para fazer a mesma tarefa e observe sem ajudar.',
      'Desenhe no papel uma tela com a ordem que faria mais sentido.',
      'Monte essa tela numa ferramenta gratuita de design.',
      'Mostre a duas pessoas e pergunte o que elas fariam primeiro.',
      'Ajuste o desenho e registre se gostou de investigar e redesenhar.',
    ],
  },
  {
    id: '14', name: 'Finanças e contabilidade', vector: v(1, 5, 1, 2, 3, 4),
    evidenceHints: ['Q08', 'Q12'],
    routine: 'Registrar entradas e saídas, conferir números e explicar o resultado.',
    attention: 'Prazos fixos, responsabilidade com erros e atualização de regras. Algumas funções exigem formação e registro profissional.',
    skill: 'Fluxo de caixa e conferência de lançamentos.',
    search: 'fluxo de caixa para iniciantes planilha',
    days: [
      'Imagine um pequeno negócio (ex.: uma lanchonete) e liste o que entra e sai.',
      'Monte uma planilha com 15 lançamentos de um mês fictício.',
      'Separe os gastos em categorias e some cada uma.',
      'Calcule quanto sobrou e qual gasto mais pesou.',
      'Escreva três sugestões para o dono melhorar o caixa.',
      'Pergunte a alguém de finanças ou contabilidade como é a rotina.',
      'Revise a planilha procurando erros e anote se gostou de conferir números.',
    ],
  },
  {
    id: '15', name: 'Fotografia e vídeo', vector: v(4, 2, 5, 2, 2, 2),
    evidenceHints: ['Q15', 'Q13'],
    routine: 'Planejar, captar e editar imagens para pessoas, marcas ou eventos.',
    attention: 'Renda variável no começo, equipamento e muitas horas de edição.',
    skill: 'Luz, enquadramento e edição básica.',
    search: 'fotografia com celular luz e enquadramento',
    days: [
      'Escolha um tema simples (ex.: uma planta, sua rua ou um objeto).',
      'Estude regra dos terços e luz natural.',
      'Faça 20 fotos do tema mudando ângulo e horário.',
      'Escolha as 3 melhores e explique por quê.',
      'Edite as 3 fotos num app gratuito.',
      'Grave um vídeo de 30 segundos sobre o tema e edite com cortes.',
      'Compare com uma referência e registre se o processo te deu energia.',
    ],
  },
  {
    id: '16', name: 'Instalação elétrica e energia solar', vector: v(5, 3, 1, 2, 2, 4),
    evidenceHints: ['Q01', 'Q14', 'Q12'],
    routine: 'Planejar, instalar e revisar instalações elétricas e sistemas de energia solar.',
    attention: 'Exige curso técnico e normas de segurança (como a NR-10) antes de qualquer trabalho real. Nunca mexa em fiação sem formação.',
    skill: 'Leitura de esquemas e noções de segurança elétrica.',
    search: 'curso eletricista instalador NR-10 energia solar',
    days: [
      'Pesquise como funciona um sistema de energia solar em casa (só leitura).',
      'Liste as partes principais e para que serve cada uma.',
      'Desenhe no papel um esquema simples de um cômodo com tomadas e lâmpadas.',
      'Leia sobre a NR-10 e anote três regras de segurança.',
      'Calcule o consumo de 5 aparelhos da sua casa pela etiqueta.',
      'Pergunte a um eletricista ou instalador como começou e o que estudou.',
      'Revise o esquema e registre se gostou de planejar a parte técnica.',
    ],
  },
  {
    id: '17', name: 'Gastronomia e confeitaria', vector: v(5, 2, 4, 2, 3, 3),
    evidenceHints: ['Q13', 'Q15'],
    routine: 'Preparar receitas, testar versões e, muitas vezes, vender o que produz.',
    attention: 'Trabalho em pé, fins de semana e cuidado com higiene e custo dos ingredientes.',
    skill: 'Ficha técnica: receita, rendimento e custo.',
    search: 'ficha técnica de receita custo e rendimento',
    days: [
      'Escolha uma receita simples que você goste.',
      'Anote ingredientes, quantidades e tempo de preparo.',
      'Faça a receita e fotografe o resultado.',
      'Calcule quanto custou cada porção.',
      'Mude um detalhe (sabor ou apresentação) e faça de novo.',
      'Peça a duas pessoas para provar e dar uma nota.',
      'Defina um preço possível e registre se gostou de produzir e testar.',
    ],
  },
  {
    id: '18', name: 'Estética e beleza', vector: v(5, 1, 4, 4, 3, 2),
    evidenceHints: ['Q15', 'Q16', 'Q13'],
    routine: 'Atender clientes em serviços de cuidado com cabelo, pele, unhas ou maquiagem.',
    attention: 'Atendimento contínuo, agenda cheia e cuidados de higiene. Procedimentos exigem curso específico.',
    skill: 'Escuta do cliente e técnica básica do serviço escolhido.',
    search: 'curso livre maquiagem cabelo design de sobrancelhas',
    days: [
      'Escolha um serviço que te interessa (ex.: maquiagem ou cabelo).',
      'Assista a uma aula introdutória gratuita sobre ele.',
      'Liste o material básico e os cuidados de higiene.',
      'Pratique a técnica em você mesmo(a), sem produtos químicos.',
      'Escreva as perguntas que faria a uma cliente antes de começar.',
      'Converse com alguém da área sobre rotina, renda e clientes.',
      'Registre se gostou da parte prática e da parte de atender pessoas.',
    ],
  },
  {
    id: '19', name: 'Cuidados em saúde', vector: v(4, 2, 1, 5, 1, 4),
    evidenceHints: ['Q16', 'Q13', 'Q12'],
    routine: 'Acompanhar pacientes e pessoas idosas, seguir protocolos e cuidar do bem-estar (cuidador, técnico de enfermagem).',
    attention: 'Plantões, carga emocional e exigência de curso técnico e registro profissional para atuar.',
    skill: 'Protocolos, observação e comunicação cuidadosa.',
    search: 'curso técnico de enfermagem cuidador de idosos rotina',
    days: [
      'Pesquise a diferença entre cuidador, técnico de enfermagem e enfermeiro.',
      'Liste o que cada um pode e não pode fazer.',
      'Monte uma rotina diária fictícia de cuidado de uma pessoa idosa.',
      'Escreva como explicaria um cuidado com calma e clareza.',
      'Leia um relato real de quem trabalha na área.',
      'Pergunte a um profissional da saúde sobre plantões e formação.',
      'Registre como se sentiu imaginando essa rotina de cuidado.',
    ],
  },
  {
    id: '20', name: 'Negócio próprio', vector: v(2, 3, 4, 3, 5, 3),
    evidenceHints: ['Q17', 'Q11', 'Q09'],
    routine: 'Criar uma oferta, encontrar clientes e cuidar de tudo um pouco.',
    attention: 'Renda incerta no começo e muitas tarefas ao mesmo tempo.',
    skill: 'Validar uma ideia antes de investir.',
    search: 'como validar ideia de negócio Sebrae',
    days: [
      'Liste três problemas que você vê no seu bairro ou no seu trabalho.',
      'Escolha um e descreva quem tem esse problema.',
      'Crie uma oferta simples para resolvê-lo.',
      'Faça uma página ou post explicando a oferta (sem publicar).',
      'Mostre a três pessoas e pergunte se pagariam e quanto.',
      'Converse com alguém que tem negócio próprio sobre o começo.',
      'Decida se a ideia merece outro teste e registre o que sentiu.',
    ],
  },
  {
    id: '21', name: 'Compras e suprimentos', vector: v(1, 4, 1, 2, 5, 4),
    evidenceHints: ['Q17', 'Q08'],
    routine: 'Comparar fornecedores, negociar preço e prazo e garantir que nada falte.',
    attention: 'Pressão por economia, prazos e conferência de pedidos.',
    skill: 'Cotação comparativa e negociação.',
    search: 'rotina comprador cotação de fornecedores',
    days: [
      'Escolha um item de uso frequente (ex.: material de escritório).',
      'Pesquise preço e prazo em três lojas.',
      'Monte uma tabela comparando preço, frete e prazo.',
      'Escolha o melhor e justifique em três linhas.',
      'Escreva uma mensagem pedindo desconto para compra maior.',
      'Pergunte a um comprador como é a negociação no dia a dia.',
      'Revise a comparação e registre se gostou de negociar.',
    ],
  },
  {
    id: '22', name: 'Produção de eventos', vector: v(3, 1, 4, 4, 4, 5),
    evidenceHints: ['Q18', 'Q10'],
    routine: 'Planejar, organizar e coordenar festas, encontros e eventos de empresas.',
    attention: 'Imprevistos, horários irregulares e muitos fornecedores ao mesmo tempo.',
    skill: 'Cronograma e lista de fornecedores.',
    search: 'como organizar evento cronograma checklist',
    days: [
      'Escolha um evento fictício (ex.: aniversário para 50 pessoas).',
      'Defina objetivo, público e orçamento.',
      'Monte a lista do que precisa: local, comida, som, decoração.',
      'Faça um cronograma do dia, hora por hora.',
      'Pesquise preço de dois fornecedores para um item.',
      'Converse com alguém que já organizou eventos.',
      'Revise o plano e registre se gostou de coordenar os detalhes.',
    ],
  },
  {
    id: '23', name: 'Redação e copywriting', vector: v(1, 4, 5, 2, 3, 2),
    evidenceHints: ['Q03', 'Q15'],
    routine: 'Escrever textos que informam ou convencem: anúncios, páginas, e-mails e roteiros.',
    attention: 'Revisões, prazos e textos avaliados por resultado.',
    skill: 'Clareza e escrita para um público específico.',
    search: 'copywriting para iniciantes estrutura de texto',
    days: [
      'Escolha um produto que você conhece bem.',
      'Descreva para quem ele é e qual problema resolve.',
      'Escreva um título e duas versões alternativas.',
      'Escreva um texto curto de anúncio com chamada para ação.',
      'Corte o texto pela metade sem perder a ideia.',
      'Peça a alguém para ler e dizer o que entendeu.',
      'Reescreva e registre se gostou de lapidar palavras.',
    ],
  },
  {
    id: '24', name: 'Educação física e bem-estar', vector: v(4, 2, 2, 5, 4, 2),
    evidenceHints: ['Q16', 'Q17', 'Q13'],
    routine: 'Orientar pessoas em exercícios, treinos e hábitos de saúde.',
    attention: 'Horários cedo ou à noite e exigência de formação e registro (CREF) para atuar como profissional.',
    skill: 'Explicar um movimento e motivar alguém a continuar.',
    search: 'formação educação física personal trainer CREF',
    days: [
      'Pesquise as formações da área e o que cada uma permite fazer.',
      'Escolha uma atividade simples (ex.: caminhada ou alongamento).',
      'Monte uma rotina de 10 minutos para um iniciante.',
      'Explique essa rotina para alguém, como se fosse a primeira aula.',
      'Pergunte o que a pessoa sentiu e o que faria ela continuar.',
      'Converse com um profissional da área sobre o dia a dia.',
      'Registre se gostou de orientar e motivar pessoas.',
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
