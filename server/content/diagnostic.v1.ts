// Conteúdo do Diagnóstico pago — somente servidor. Informação editorial e verificável:
// sem nomes de escolas, preços ou salários inventados. Onde há exigência legal, ela é dita com clareza.
import type { Dimension } from '../../shared/quiz';

export const DIAGNOSTIC_VERSION = 'diagnostic-v1';

export type CareerDiagnostic = {
  /** livre: começa sem diploma; tecnico: curso técnico/livre é o caminho comum; regulada: exige formação/registro. */
  path: 'livre' | 'tecnico' | 'regulada';
  formation: string;
  /** Termos para pesquisar cursos (a pessoa escolhe com o checklist; não indicamos escola). */
  courseTerms: string[];
  /** Prova concreta para ter pronta ao fim das 4 semanas. */
  proof: string;
  /** Títulos de vaga ou formas de começar, para usar como busca. */
  firstJobs: string[];
  /** Com quem conversar e uma pergunta específica da área. */
  talkTo: string;
  talkQuestion: string;
  /** Alerta específico da área ao escolher curso. */
  courseWarning?: string;
};

export const CAREER_DIAGNOSTICS: Record<string, CareerDiagnostic> = {
  '01': {
    path: 'livre',
    formation: 'Não há diploma obrigatório. As próprias plataformas oferecem formação gratuita (Meta Blueprint e Google Skillshop), e é por elas que vale começar.',
    courseTerms: ['Meta Blueprint fundamentos', 'Google Skillshop Google Ads', 'gestão de tráfego para iniciantes'],
    proof: 'Um plano de campanha completo para um negócio real do seu bairro: público, oferta, 2 anúncios escritos, orçamento e as métricas que você acompanharia.',
    firstJobs: ['assistente de marketing digital', 'analista de tráfego júnior', 'tráfego para pequenos negócios (freela)'],
    talkTo: 'um gestor de tráfego ou analista de mídia paga',
    talkQuestion: 'Como você conseguiu o primeiro cliente ou a primeira vaga, e que resultado mostrou?',
    courseWarning: 'Desconfie de curso que promete faturamento rápido como gestor: o trabalho é de teste, análise e ajuste constante.',
  },
  '02': {
    path: 'livre',
    formation: 'Não exige diploma específico para começar. Vagas de entrada costumam pedir planilhas (Excel ou Google Sheets) e, logo depois, SQL e uma ferramenta de painel como Power BI ou Looker Studio.',
    courseTerms: ['Excel intermediário tabela dinâmica', 'SQL para iniciantes', 'Power BI introdução'],
    proof: 'Um painel feito com dados públicos (por exemplo, de um portal de dados abertos do governo) e 3 conclusões escritas em linguagem simples.',
    firstJobs: ['assistente de dados', 'analista de dados júnior', 'estágio em BI'],
    talkTo: 'um analista de dados ou de BI',
    talkQuestion: 'Quanto do seu dia é limpar dados e quanto é analisar? O que você faria diferente no começo?',
  },
  '03': {
    path: 'livre',
    formation: 'Faculdade ajuda, mas muitas vagas de entrada não exigem. O que mais pesa é ter projetos publicados que outra pessoa possa abrir.',
    courseTerms: ['HTML CSS JavaScript iniciante', 'Git e GitHub para iniciantes', 'MDN Web Docs aprender'],
    proof: 'Uma página publicada (por exemplo, no GitHub Pages) feita por você, com pelo menos 2 seções, um formulário e funcionando no celular.',
    firstJobs: ['estágio em desenvolvimento', 'desenvolvedor front-end júnior', 'landing pages para pequenos negócios (freela)'],
    talkTo: 'um desenvolvedor que esteja há 1 a 3 anos na área',
    talkQuestion: 'O que te fez ser chamado para a primeira vaga: o curso, o portfólio ou uma indicação?',
    courseWarning: 'Desconfie de promessa de emprego garantido em poucos meses; prefira cursos em que você constrói projetos do zero.',
  },
  '04': {
    path: 'livre',
    formation: 'Curso livre ou técnico basta para começar. Quem contrata olha o portfólio, não o certificado.',
    courseTerms: ['fundamentos de design gráfico tipografia e cor', 'Figma para iniciantes', 'Canva para negócios'],
    proof: '3 peças para um mesmo cliente (post, cartaz e cartão), com uma explicação curta de cada escolha de cor, fonte e hierarquia.',
    firstJobs: ['assistente de design', 'designer gráfico júnior', 'identidade visual para pequenos negócios (freela)'],
    talkTo: 'um designer gráfico que atenda clientes',
    talkQuestion: 'Como você lida com pedidos de alteração e como define o preço de uma peça?',
  },
  '05': {
    path: 'livre',
    formation: 'Não há formação obrigatória. Constância e um tema bem definido valem mais que certificado; um curso de roteiro e edição acelera o começo.',
    courseTerms: ['roteiro para vídeos curtos', 'edição de vídeo no celular', 'social media para iniciantes'],
    proof: '10 conteúdos publicados sobre um mesmo tema, com uma anotação do que teve mais resposta e por quê.',
    firstJobs: ['social media júnior', 'assistente de conteúdo', 'conteúdo para pequenos negócios (freela)'],
    talkTo: 'um social media ou criador de conteúdo que trabalhe para marcas',
    talkQuestion: 'Como é sua semana de produção e como você mede se um conteúdo funcionou?',
  },
  '06': {
    path: 'livre',
    formation: 'Não exige formação específica. Muitas empresas treinam quem entra em pré-vendas (SDR) ou vendas internas; o que pesa é saber conduzir uma conversa.',
    courseTerms: ['vendas consultivas perguntas de diagnóstico', 'pré-vendas SDR iniciante', 'técnicas de negociação'],
    proof: 'Um roteiro de descoberta com 8 perguntas, testado em 3 conversas reais (pode ser vendendo algo seu ou de um conhecido), com as anotações do que aprendeu.',
    firstJobs: ['SDR / pré-vendas', 'vendedor interno', 'consultor de vendas'],
    talkTo: 'um vendedor ou SDR de empresa de serviços',
    talkQuestion: 'Como funciona a meta e a comissão no seu dia a dia, e o que te ajudou nos primeiros meses?',
  },
  '07': {
    path: 'tecnico',
    formation: 'Curso livre de assistente administrativo ou técnico em administração ajudam. O mais pedido nas vagas é domínio de planilhas e organização de documentos.',
    courseTerms: ['assistente administrativo curso', 'Excel para rotinas administrativas', 'técnico em administração'],
    proof: 'Uma planilha de controle (contas, prazos ou estoque) com instruções de uso que outra pessoa consiga seguir sozinha.',
    firstJobs: ['assistente administrativo', 'auxiliar de escritório', 'auxiliar de departamento pessoal'],
    talkTo: 'um assistente ou analista administrativo',
    talkQuestion: 'Quais tarefas tomam mais tempo na sua semana e quais ferramentas você mais usa?',
  },
  '08': {
    path: 'livre',
    formation: 'Costuma ser um passo depois de alguma experiência em equipe. Comece aplicando em projetos da sua própria realidade; certificações (como CAPM ou Scrum) fazem mais sentido depois, não antes.',
    courseTerms: ['fundamentos de gestão de projetos', 'Scrum e Kanban introdução', 'Trello ou Notion para projetos'],
    proof: 'Um projeto pequeno e real planejado e acompanhado por você: escopo, cronograma, responsáveis e um relatório de status no fim.',
    firstJobs: ['assistente de projetos', 'analista de PMO júnior', 'coordenação de projetos voluntários'],
    talkTo: 'um coordenador ou analista de projetos',
    talkQuestion: 'Como você chegou a coordenar projetos e o que fazia antes disso?',
  },
  '09': {
    path: 'tecnico',
    formation: 'Psicologia ou gestão de RH ajudam a crescer, mas muitas vagas de assistente aceitam curso livre ou técnico em recursos humanos.',
    courseTerms: ['recrutamento e seleção curso', 'entrevista por competências', 'técnico em recursos humanos'],
    proof: 'Um processo seletivo simulado: descrição da vaga, critérios objetivos e um roteiro de entrevista estruturada aplicado com um conhecido.',
    firstJobs: ['assistente de RH', 'estágio em recrutamento', 'recrutador júnior'],
    talkTo: 'um recrutador ou analista de RH',
    talkQuestion: 'Quantas conversas você faz por semana e o que mais pesa quando você aprova alguém?',
  },
  '10': {
    path: 'regulada',
    formation: 'Para dar aula em escola regular é preciso licenciatura na área. Reforço escolar, cursos livres e treinamentos em empresas não exigem esse diploma e são boas portas de entrada.',
    courseTerms: ['didática para iniciantes', 'como dar aula de reforço', 'instrutor de treinamento corporativo'],
    proof: 'Uma aula de 20 minutos dada para alguém (ou gravada), com um exercício e a opinião de quem assistiu.',
    firstJobs: ['monitor ou tutor', 'professor de reforço', 'instrutor de cursos livres'],
    talkTo: 'um professor ou instrutor de cursos livres',
    talkQuestion: 'Quanto tempo você gasta preparando uma aula e o que mais te cansa e mais te motiva?',
    courseWarning: 'Antes de pagar uma licenciatura, confira no e-MEC se o curso e a instituição são reconhecidos.',
  },
  '11': {
    path: 'tecnico',
    formation: 'Técnico em logística é comum e relativamente curto, e muitas vagas de auxiliar ensinam na prática. Planilhas ajudam a subir de função.',
    courseTerms: ['técnico em logística', 'controle de estoque curso', 'Excel para logística'],
    proof: 'Um fluxo de estoque desenhado (entrada, armazenagem e saída) com uma planilha de controle preenchida com dados de exemplo.',
    firstJobs: ['auxiliar de logística', 'assistente de estoque', 'conferente'],
    talkTo: 'um auxiliar, analista ou supervisor de logística',
    talkQuestion: 'Como é o ritmo nos dias de pico e quais erros mais custam caro na operação?',
  },
  '12': {
    path: 'tecnico',
    formation: 'Técnico em informática ou cursos de suporte (help desk) são o caminho comum. Certificações internacionais são opcionais e vêm depois.',
    courseTerms: ['suporte técnico help desk curso', 'técnico em informática', 'manutenção de computadores'],
    proof: 'Um manual curto com 5 problemas comuns que você resolveu (em casa ou para conhecidos), passo a passo, com o diagnóstico de cada um.',
    firstJobs: ['técnico de suporte N1', 'help desk', 'auxiliar de manutenção'],
    talkTo: 'um técnico de suporte ou de manutenção',
    talkQuestion: 'Que tipo de chamado você mais atende e o que te fez evoluir de nível?',
  },
  '13': {
    path: 'livre',
    formation: 'Não exige diploma específico. O que conta é um estudo de caso mostrando como você entendeu um problema real e chegou à solução.',
    courseTerms: ['UX design introdução pesquisa com usuários', 'Figma para iniciantes', 'heurísticas de usabilidade'],
    proof: 'Um estudo de caso: 3 conversas com usuários, o problema que você encontrou, um protótipo no Figma e o que mudou depois do teste.',
    firstJobs: ['estágio em UX', 'designer UX/UI júnior', 'assistente de produto'],
    talkTo: 'um designer de UX/UI ou de produto',
    talkQuestion: 'Como foi seu primeiro estudo de caso e o que os recrutadores mais perguntaram sobre ele?',
  },
  '14': {
    path: 'regulada',
    formation: 'Para atuar como contador é preciso graduação em Ciências Contábeis e registro no CRC. Funções de auxiliar financeiro, fiscal ou de contas a pagar aceitam técnico ou curso livre e são uma boa porta de entrada.',
    courseTerms: ['rotinas de contas a pagar e receber', 'técnico em contabilidade', 'Excel financeiro'],
    proof: 'O fluxo de caixa de 1 mês de um pequeno negócio (real ou simulado), com 3 recomendações para melhorar o resultado.',
    firstJobs: ['auxiliar financeiro', 'assistente de contas a pagar', 'auxiliar contábil ou fiscal'],
    talkTo: 'um auxiliar financeiro ou contador',
    talkQuestion: 'Como é o fechamento do mês na sua rotina e o que um iniciante mais erra?',
    courseWarning: 'Se for fazer graduação, confira no e-MEC se o curso é reconhecido; isso é condição para o registro no CRC.',
  },
  '15': {
    path: 'livre',
    formation: 'Não há formação obrigatória. Um curso curto de fotografia ou edição ajuda, mas o portfólio é o que fecha trabalho. Dá para começar com o celular.',
    courseTerms: ['fotografia para iniciantes luz e composição', 'edição de vídeo iniciante', 'fotografia de produto com celular'],
    proof: 'Um portfólio com 15 fotos ou 3 vídeos curtos de um mesmo tipo de trabalho (produto, retrato ou evento).',
    firstJobs: ['assistente de fotografia', 'editor de vídeo júnior', 'fotos para pequenos negócios (freela)'],
    talkTo: 'um fotógrafo ou videomaker que atenda clientes',
    talkQuestion: 'Qual tipo de trabalho paga suas contas e quanto tempo você gasta editando?',
  },
  '16': {
    path: 'regulada',
    formation: 'Trabalhar com eletricidade exige formação e o treinamento obrigatório NR-10. Cursos de eletricista instalador (como os do SENAI) e o técnico em eletrotécnica são caminhos comuns. Não faça instalações sem formação e supervisão.',
    courseTerms: ['eletricista instalador predial SENAI', 'NR-10 básico', 'instalador de sistemas fotovoltaicos'],
    proof: 'A matrícula ou o certificado do curso básico e um caderno com 5 esquemas elétricos lidos e explicados por você (sem mexer em instalação real).',
    firstJobs: ['ajudante de eletricista', 'auxiliar de instalação solar', 'eletricista predial (após o curso)'],
    talkTo: 'um eletricista ou instalador de energia solar',
    talkQuestion: 'Como foi seu começo como ajudante e quais cuidados de segurança você nunca deixa de lado?',
    courseWarning: 'Desconfie de curso de energia solar sem aulas práticas e sem tratar de segurança (NR-10 e NR-35 para trabalho em altura).',
  },
  '17': {
    path: 'tecnico',
    formation: 'Curso livre de cozinha ou confeitaria já permite começar; técnico ou superior em gastronomia aprofundam. Para vender comida, conheça as regras de boas práticas da vigilância sanitária da sua cidade.',
    courseTerms: ['boas práticas de manipulação de alimentos', 'confeitaria para iniciantes', 'ficha técnica e precificação de receitas'],
    proof: '3 receitas com ficha técnica, custo por porção e preço de venda, testadas com pelo menos 5 pessoas.',
    firstJobs: ['auxiliar de cozinha', 'ajudante de confeitaria', 'venda sob encomenda'],
    talkTo: 'um cozinheiro, confeiteiro ou dono de pequeno negócio de comida',
    talkQuestion: 'Como você define o preço do que vende e como é a rotina nos dias de mais movimento?',
  },
  '18': {
    path: 'tecnico',
    formation: 'Cursos livres são o caminho comum para cabelo, maquiagem, unhas e sobrancelhas. Procedimentos estéticos mais invasivos exigem formação técnica ou superior. Biossegurança é obrigatória em qualquer serviço.',
    courseTerms: ['biossegurança para estética e beleza', 'curso de design de sobrancelhas', 'maquiagem profissional iniciante'],
    proof: 'Um portfólio com 5 atendimentos (com autorização para fotos de antes e depois) e uma tabela de preços definida com base no seu custo.',
    firstJobs: ['auxiliar de salão', 'atendimento em domicílio', 'profissional autônoma (manicure, maquiagem, sobrancelhas)'],
    talkTo: 'uma profissional de beleza que atenda há alguns anos',
    talkQuestion: 'Como você conseguiu os primeiros clientes fixos e quanto tempo levou para ter agenda cheia?',
    courseWarning: 'Desconfie de curso que ensina procedimento invasivo (como aplicação de substâncias) sem exigir formação na área de saúde.',
  },
  '19': {
    path: 'regulada',
    formation: 'Técnico de enfermagem exige curso técnico reconhecido e registro no COREN. Cuidador de idosos tem cursos livres e é uma porta de entrada mais rápida. Confirme o reconhecimento antes de pagar.',
    courseTerms: ['curso de cuidador de idosos', 'técnico em enfermagem', 'primeiros socorros curso'],
    proof: 'Um curso de primeiros socorros concluído e 2 conversas com profissionais da área sobre a rotina real (plantões, esforço físico e emocional).',
    firstJobs: ['cuidador de idosos', 'acompanhante hospitalar', 'técnico de enfermagem (após a formação)'],
    talkTo: 'um técnico de enfermagem ou cuidador de idosos',
    talkQuestion: 'Como é a escala de plantões e o que mais pesa emocionalmente no trabalho?',
    courseWarning: 'Antes de pagar um curso técnico, confira no SISTEC (MEC) se ele está regularizado; sem isso não há registro no COREN.',
  },
  '20': {
    path: 'livre',
    formation: 'Não há formação obrigatória. O Sebrae oferece cursos gratuitos de gestão, vendas e formalização como MEI.',
    courseTerms: ['Sebrae cursos gratuitos gestão', 'como abrir MEI', 'validação de ideia de negócio'],
    proof: 'Uma oferta testada: 10 conversas com possíveis clientes e pelo menos 1 venda ou pré-venda, com o custo e o lucro anotados.',
    firstJobs: ['serviço ou produto próprio como MEI', 'revenda ou venda sob encomenda', 'sociedade em pequeno negócio'],
    talkTo: 'alguém que tenha um pequeno negócio há mais de 2 anos',
    talkQuestion: 'O que você queria ter sabido antes de abrir e quanto tempo levou para o negócio se pagar?',
    courseWarning: 'Desconfie de curso caro que promete renda rápida; valide a ideia com clientes antes de investir em estoque ou estrutura.',
  },
  '21': {
    path: 'tecnico',
    formation: 'Técnico em logística ou administração, ou um curso livre de compras, ajudam. O centro do trabalho é planilha, comparação de propostas e negociação.',
    courseTerms: ['curso de compras e suprimentos', 'negociação com fornecedores', 'Excel para compras'],
    proof: 'Uma cotação comparativa de 3 fornecedores para um item real, com a justificativa da escolha além do preço (prazo, qualidade, condições).',
    firstJobs: ['assistente de compras', 'auxiliar de suprimentos', 'comprador júnior'],
    talkTo: 'um comprador ou analista de suprimentos',
    talkQuestion: 'Como você negocia com fornecedor e como é cobrado por resultado?',
  },
  '22': {
    path: 'livre',
    formation: 'Não há formação obrigatória. Cursos livres de produção de eventos e cerimonial ajudam; trabalhar como apoio em eventos é a forma mais rápida de aprender.',
    courseTerms: ['produção de eventos curso', 'cerimonial e eventos iniciante', 'orçamento de eventos'],
    proof: 'Um evento pequeno e real (aniversário, encontro, feira) planejado com cronograma, orçamento e checklist, e um relato do que deu certo e errado.',
    firstJobs: ['assistente de produção', 'recepcionista de eventos', 'auxiliar de cerimonial'],
    talkTo: 'um produtor de eventos ou cerimonialista',
    talkQuestion: 'Como é a semana de um evento grande e como você lida com imprevistos no dia?',
  },
  '23': {
    path: 'livre',
    formation: 'Não há formação obrigatória. Clientes e empresas avaliam pelos textos que você mostra; um curso de copywriting ou redação publicitária acelera.',
    courseTerms: ['copywriting iniciante', 'redação publicitária', 'escrita para web e SEO'],
    proof: '5 textos para um mesmo cliente (anúncio, e-mail, página, post e roteiro), com a versão antes e depois de revisar.',
    firstJobs: ['redator júnior', 'assistente de conteúdo', 'textos para pequenos negócios (freela)'],
    talkTo: 'um redator ou copywriter',
    talkQuestion: 'Como você consegue clientes e como recebe retorno sobre o que escreve?',
  },
  '24': {
    path: 'regulada',
    formation: 'Atuar como profissional de educação física (personal, academia) exige graduação e registro no CREF. Sem isso, dá para começar como estagiário durante a faculdade ou em funções de apoio, como recreação e recepção de academia.',
    courseTerms: ['graduação em educação física bacharelado', 'recreação curso livre', 'estágio em academia'],
    proof: 'Visitas a 2 academias ou estúdios, conversa com profissionais e uma decisão anotada sobre a graduação (duração, modalidade e custo que cabe no seu bolso).',
    firstJobs: ['estagiário de academia (com matrícula na graduação)', 'recreador', 'recepcionista de academia'],
    talkTo: 'um profissional de educação física',
    talkQuestion: 'Como foi a faculdade e o estágio, e como você conseguiu os primeiros alunos?',
    courseWarning: 'Confira no e-MEC se a graduação é reconhecida; sem isso não há registro no CREF.',
  },
};

/** Como contornar quando a pessoa marcou baixo numa atividade que a carreira exige. */
export const DIM_MITIGATION: Record<Dimension, string> = {
  P: 'Comece com tarefas práticas curtas e guiadas: assista a um passo e repita junto, em vez de tentar sozinho do zero.',
  A: 'Use modelos prontos (planilhas, checklists) e aprenda uma ferramenta por vez, sem tentar entender tudo antes de começar.',
  C: 'Parta de referências: copie a estrutura de 3 bons exemplos antes de criar do seu jeito.',
  S: 'Teste conversas curtas e com roteiro antes de interações longas; anote como você se sentiu depois de cada uma.',
  N: 'Comece fazendo propostas por mensagem escrita antes de partir para ligações ou reuniões.',
  O: 'Reserve os 5 minutos finais de cada sessão para anotar o próximo passo; assim você não depende de memória.',
};

/** Como um ponto forte da pessoa ajuda neste plano. */
export const DIM_STRENGTH: Record<Dimension, string> = {
  P: 'Você aprende fazendo: priorize as tarefas práticas do plano e não fique só na teoria.',
  A: 'Você gosta de entender o porquê: use isso para comparar cursos e caminhos com critério, sem ir pelo impulso.',
  C: 'Você gosta de criar: capriche na apresentação da sua prova final, ela é o que as pessoas vão ver.',
  S: 'Você se dá bem com pessoas: use isso para conseguir as conversas com profissionais da semana 4.',
  N: 'Você tem iniciativa: não espere estar pronto para oferecer seu trabalho; ofereça a prova da semana 3 para alguém real.',
  O: 'Você gosta de planejar: transforme este plano em um calendário e marque cada tarefa feita.',
};

/** O que a experiência atual costuma trazer, por área de atividade. */
export const DIM_TRANSFER: Record<Dimension, string> = {
  P: 'resolver problemas com as mãos e fazer as coisas funcionarem',
  A: 'atenção a números, detalhes e conferência',
  C: 'criatividade para apresentar e resolver de outro jeito',
  S: 'trato com pessoas e paciência para explicar',
  N: 'negociar, convencer e tomar a frente',
  O: 'organizar rotina, prazos e documentos',
};

/** Palavras da área atual (sem acento, minúsculas) → atividades que ela costuma exercitar. */
export const AREA_KEYWORDS: { re: RegExp; dims: Dimension[] }[] = [
  { re: /vend|comerci|loja|varejo|caixa|balconi/, dims: ['N', 'S'] },
  { re: /atendi|recep|telemarket|call ?center|sac\b|suporte ao cliente/, dims: ['S', 'O'] },
  { re: /administ|escritori|financ|contab|banco|fiscal|secretar/, dims: ['O', 'A'] },
  { re: /saude|enferm|hospital|cuidad|clinica|farmac/, dims: ['S', 'P'] },
  { re: /educa|professor|escola|ensino|pedagog|monitor/, dims: ['S', 'C'] },
  { re: /\bti\b|informatica|tecnologia|sistema|program|desenvolv|dados/, dims: ['A', 'P'] },
  { re: /constru|obra|pedreir|eletric|mecanic|manutenc|fabrica|industri|producao|montag|operador/, dims: ['P', 'O'] },
  { re: /cozinh|restaurant|aliment|garcom|confeit|padaria|lanchonete/, dims: ['P', 'S'] },
  { re: /logistic|estoque|motorista|entreg|armazem|transport|almoxarif/, dims: ['O', 'P'] },
  { re: /marketing|design|social media|comunica|midia|publicid|jornal/, dims: ['C', 'N'] },
  { re: /beleza|salao|estetic|cabel|manicure|maqui/, dims: ['P', 'S'] },
  { re: /\brh\b|recursos humanos|recrut|departamento pessoal/, dims: ['S', 'O'] },
];

export const COURSE_CHECKLIST = [
  'Mostra a grade completa (o que você vai aprender, aula por aula) antes de você pagar.',
  'Tem prática de verdade: você termina com algo feito por você, não só com vídeos assistidos.',
  'Diz quem ensina e onde essa pessoa trabalha ou trabalhou na área.',
  'Tem avaliações de alunos fora do site do próprio curso (busque o nome do curso + "reclamação").',
  'Permite começar por uma aula gratuita ou tem prazo de arrependimento claro.',
];

export const COURSE_RED_FLAGS = [
  'Promete emprego garantido ou renda alta em pouco tempo.',
  'Pressiona com "só hoje" ou contagem regressiva para você pagar agora.',
  'Não mostra o conteúdo nem quem ensina.',
  'Vende "certificado reconhecido" sem dizer reconhecido por quem.',
];
