// Monta a aplicação a partir das variáveis de ambiente (reaproveitada entre invocações quentes).
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb } from './db';
import { repairJsonbInBackground } from './db/repair';
import { createMessageSender } from './whatsapp';
import { createProvider } from './payments';
import type { App } from './services';

let appPromise: Promise<App> | undefined;

export function getApp(): Promise<App> {
  appPromise ??= (async () => {
    const cfg = loadConfig();
    let url = cfg.databaseUrl;
    if (!url && process.env.USE_NETLIFY_DB === '1') {
      // Netlify Database: string de conexão do branch de banco deste deploy.
      const { getConnectionString } = await import('@netlify/database');
      url = getConnectionString();
    }
    // Hospedado (Netlify/Lambda) sem banco configurado: falhar alto em vez de gravar numa memória que se perde.
    const hosted = !!(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.SITE_ID || process.env.NETLIFY);
    if (!url && hosted && !process.env.PGLITE_DIR) {
      throw new Error('Banco não configurado: defina USE_NETLIFY_DB=1 ou DATABASE_URL nas variáveis do site');
    }
    const db = url ? await createPostgresDb(url) : await createPgliteDb(process.env.PGLITE_DIR || undefined);
    if (url) await repairJsonbInBackground(db);
    return { cfg, db, provider: createProvider(cfg), messages: createMessageSender(cfg), fetchImpl: fetch };
  })().catch((e) => {
    appPromise = undefined;
    throw e;
  });
  return appPromise;
}
