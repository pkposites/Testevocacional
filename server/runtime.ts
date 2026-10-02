// Monta a aplicação a partir das variáveis de ambiente (reaproveitada entre invocações quentes).
import { loadConfig } from './config';
import { createPgliteDb, createPostgresDb } from './db';
import { createEmailSender } from './email';
import { createProvider } from './payments';
import type { App } from './services';

let appPromise: Promise<App> | undefined;

export function getApp(): Promise<App> {
  appPromise ??= (async () => {
    const cfg = loadConfig();
    const db = cfg.databaseUrl ? await createPostgresDb(cfg.databaseUrl) : await createPgliteDb(process.env.PGLITE_DIR || undefined);
    return { cfg, db, provider: createProvider(cfg), sendEmail: createEmailSender(cfg), fetchImpl: fetch };
  })().catch((e) => {
    appPromise = undefined;
    throw e;
  });
  return appPromise;
}
