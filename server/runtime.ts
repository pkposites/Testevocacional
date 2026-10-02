// Monta a aplicação a partir das variáveis de ambiente (reaproveitada entre invocações quentes).
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb } from './db';
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
    const db = url ? await createPostgresDb(url) : await createPgliteDb(process.env.PGLITE_DIR || undefined);
    return { cfg, db, provider: createProvider(cfg), messages: createMessageSender(cfg), fetchImpl: fetch };
  })().catch((e) => {
    appPromise = undefined;
    throw e;
  });
  return appPromise;
}
