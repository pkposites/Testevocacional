import { handle } from '../../server/app';
import { getApp } from '../../server/runtime';

export default async (req: Request) => {
  try {
    return await handle(await getApp(), req);
  } catch (e) {
    console.error('Falha ao iniciar a API', (e as Error).message);
    return new Response(JSON.stringify({ code: 'unavailable', message: 'Serviço indisponível. Tente novamente.' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }
};

export const config = { path: '/api/*' };
