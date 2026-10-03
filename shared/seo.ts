// SEO das páginas públicas. Usado no navegador (título/descrição ao navegar) e no build
// (páginas HTML por rota, sitemap.xml) para o Google ler sem depender de JavaScript.

export const SITE_NAME = 'Mapa da Carreira';
export const DEFAULT_BASE_URL = 'https://mapa-da-carreira-teste.netlify.app';

export type PageSeo = { path: string; title: string; description: string; index: boolean; priority?: number };

export const PUBLIC_PAGES: PageSeo[] = [
  {
    path: '/',
    title: 'Teste vocacional grátis: descubra caminhos profissionais que combinam com você | Mapa da Carreira',
    description:
      'Teste vocacional grátis em 4 minutos: responda 18 perguntas sobre o que você gosta de fazer e veja 5 caminhos profissionais que combinam com suas respostas, com um primeiro passo prático.',
    index: true,
    priority: 1.0,
  },
  {
    path: '/teste',
    title: 'Fazer o teste vocacional grátis (18 perguntas) | Mapa da Carreira',
    description: 'Comece agora o teste vocacional gratuito: 18 frases rápidas sobre o que você gosta de fazer, cerca de 4 minutos e resultado na hora.',
    index: true,
    priority: 0.8,
  },
  {
    path: '/ajuda',
    title: 'Ajuda e suporte | Mapa da Carreira',
    description: 'Como abrir ou recuperar seu mapa, o que fazer se perdeu o código e como falar com o suporte do Mapa da Carreira.',
    index: true,
    priority: 0.3,
  },
  {
    path: '/privacidade',
    title: 'Política de privacidade | Mapa da Carreira',
    description: 'Como o Mapa da Carreira trata seus dados: o que coletamos, para que usamos e como pedir a exclusão.',
    index: true,
    priority: 0.2,
  },
  {
    path: '/termos',
    title: 'Termos de uso | Mapa da Carreira',
    description: 'Termos de uso do Mapa da Carreira: o que o teste oferece, limites do resultado, pagamento e reembolso.',
    index: true,
    priority: 0.2,
  },
];

/** Páginas pessoais ou de operação: nunca no Google. */
export const PRIVATE_PREFIXES = ['/previa', '/mapa/', '/pagamento/', '/diagnostico/', '/acesso', '/meus-mapas', '/admin'];

export function seoFor(pathname: string): PageSeo {
  const p = pathname.replace(/\/+$/, '') || '/';
  const found = PUBLIC_PAGES.find((x) => x.path === p);
  if (found) return found;
  const isPrivate = PRIVATE_PREFIXES.some((x) => p === x.replace(/\/$/, '') || p.startsWith(x));
  // Rotas desconhecidas e páginas pessoais: título padrão, fora do Google.
  return { ...PUBLIC_PAGES[0], title: isPrivate ? SITE_NAME : PUBLIC_PAGES[0].title, path: p, index: false };
}

export const FAQ: { q: string; a: string }[] = [
  {
    q: 'O teste vocacional é grátis?',
    a: 'Sim. Você responde as 18 perguntas e recebe grátis os 5 caminhos que mais combinam com suas respostas, o motivo de cada um e um plano de 7 dias para testar. Depois, se quiser, pode comprar o roteiro prático de um caminho.',
  },
  {
    q: 'Quanto tempo leva?',
    a: 'Cerca de 4 minutos. São frases curtas sobre o que você gosta de fazer, e você responde tocando na opção que mais combina com você.',
  },
  {
    q: 'Como o resultado é calculado?',
    a: 'Comparamos o seu perfil de interesses (prática, análise, criação, colaboração, negociação e organização) com o que cada um dos 24 caminhos do catálogo exige no dia a dia. A porcentagem mostra o quanto suas respostas combinam com cada caminho.',
  },
  {
    q: 'O teste diz qual profissão eu devo seguir?',
    a: 'Não. É uma ferramenta de exploração: mostra caminhos que tendem a combinar com o que você gosta de fazer e sugere como testá-los na prática. Não mede talento, não é avaliação psicológica e não garante emprego.',
  },
  {
    q: 'Para quem é o Mapa da Carreira?',
    a: 'Para quem está escolhendo a primeira área, quer mudar de área ou quer explorar outra possibilidade sem largar o trabalho atual.',
  },
];
