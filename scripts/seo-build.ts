// Depois do vite build: uma página HTML por rota pública (título, descrição, canonical, Open Graph),
// dados estruturados, sitemap.xml e robots.txt. Assim o Google lê tudo sem depender do JavaScript.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_BASE_URL, FAQ, PRIVATE_PREFIXES, PUBLIC_PAGES, SITE_NAME, type PageSeo } from '../shared/seo';

const base = (process.env.SEO_BASE_URL || process.env.PUBLIC_BASE_URL || process.env.URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const verification = (process.env.GOOGLE_SITE_VERIFICATION || '').trim();
const seller = (process.env.SELLER_NAME || '').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const template = readFileSync('dist/index.html', 'utf8');

function head(p: PageSeo) {
  const url = `${base}${p.path === '/' ? '/' : p.path}`;
  const tags = [
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${base}/og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${base}/og.png" />`,
  ];
  if (verification) tags.push(`<meta name="google-site-verification" content="${esc(verification)}" />`);
  if (p.path === '/') {
    const ld = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: `${base}/`, inLanguage: 'pt-BR' },
      {
        '@context': 'https://schema.org', '@type': 'WebApplication', name: `${SITE_NAME} · Teste vocacional`, url: `${base}/`,
        applicationCategory: 'EducationalApplication', operatingSystem: 'Web', inLanguage: 'pt-BR', description: p.description,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        ...(seller ? { provider: { '@type': 'Organization', name: seller } } : {}),
      },
      {
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ];
    tags.push(`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.map((t) => `    ${t}`).join('\n');
}

function page(p: PageSeo) {
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${esc(p.description)}" />`)
    .replace('<!--seo-->', head(p).trimStart());
}

for (const p of PUBLIC_PAGES) {
  const html = page(p);
  if (p.path === '/') writeFileSync('dist/index.html', html);
  else {
    mkdirSync(`dist${p.path}`, { recursive: true });
    writeFileSync(`dist${p.path}/index.html`, html);
  }
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PAGES.filter((p) => p.index).map((p) => `  <url><loc>${base}${p.path === '/' ? '/' : p.path}</loc><lastmod>${today}</lastmod><priority>${(p.priority ?? 0.5).toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`);

writeFileSync('dist/robots.txt', `User-agent: *
Allow: /
${[...PRIVATE_PREFIXES, '/api/'].map((x) => `Disallow: ${x}`).join('\n')}

Sitemap: ${base}/sitemap.xml
`);

console.log(`SEO: ${PUBLIC_PAGES.length} páginas, sitemap e robots para ${base}${verification ? ' (com verificação do Google)' : ''}`);
