// Garante que o código enviado ao navegador não contém ranking, catálogo ou planos pagos.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk('dist');
const all = files.filter((f) => /\.(js|html|css)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');

const forbidden = [
  'Gestão de tráfego', 'Análise de dados', 'Desenvolvimento web', 'Manutenção e suporte técnico', 'Recrutamento e seleção',
  'Desenhe uma campanha sem publicar', 'Monte dez registros em uma planilha', 'Escreva um roteiro de solução reversível',
  'Cobrança por desempenho', 'fundamentos logística estoque', 'Estou explorando sua área',
];
const leaks = forbidden.filter((s) => all.includes(s));
if (leaks.length) {
  console.error('Conteúdo pago encontrado no bundle:', leaks);
  process.exit(1);
}
console.log(`Bundle ok: ${files.length} arquivos sem conteúdo pago.`);
