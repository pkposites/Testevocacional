// Servidor local da API (porta 8788) com PGlite persistido em .dev-data e provedor fake.
import { createServer } from 'node:http';
import { handle } from '../server/app';
import { getApp } from '../server/runtime';

process.env.PGLITE_DIR ??= './.dev-data/pglite';
process.env.ADMIN_PASSWORD ??= 'admin-local';

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const request = new Request(`http://localhost:5173${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
  const response = await handle(await getApp(), request);
  const out: Record<string, string | string[]> = {};
  response.headers.forEach((v, k) => (out[k] = v));
  const cookies = response.headers.getSetCookie();
  if (cookies.length) out['set-cookie'] = cookies;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(8788, () => console.log('API local em http://localhost:8788 (provedor fake, admin: admin-local)'));
