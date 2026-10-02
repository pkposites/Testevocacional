// Acesso ao Postgres: postgres.js em produção (Supabase) e PGlite em testes/dev local.
// Toda escrita que precisa ser atômica usa db.tx().
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export interface Db {
  query<T = Record<string, any>>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export async function one<T = Record<string, any>>(db: Db, sql: string, params?: unknown[]): Promise<T | undefined> {
  const rows = await db.query<T>(sql, params);
  return rows[0];
}

export function schemaSql(): string {
  const candidates = [
    join(process.cwd(), 'server/db/schema.sql'),
    join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error('schema.sql não encontrado');
}

export async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  // prepare:false é exigido pelo pooler em modo transação do Supabase (porta 6543).
  // Algumas conexões permitem que o painel faça suas consultas em paralelo.
  const max = Math.min(10, Math.max(1, Number(process.env.DB_POOL_MAX ?? 4)));
  // O código já envia JSON serializado (JSON.stringify + $n::jsonb). Por padrão o postgres.js
  // serializa de novo e grava uma string JSON em vez do objeto; aqui textos passam direto.
  const passJson = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  const sql = postgres(url, {
    max, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {},
    types: {
      json: { to: 114, from: [114], serialize: passJson, parse: (x: string) => JSON.parse(x) },
      jsonb: { to: 3802, from: [3802], serialize: passJson, parse: (x: string) => JSON.parse(x) },
    } as any,
  });
  const wrap = (s: any): Db => ({
    query: async (text, params = []) => (await s.unsafe(text, params as any[])) as any,
    tx: (fn) => (s.begin ? s.begin((t: any) => fn(wrap(t))) : fn(wrap(s))) as any,
  });
  return wrap(sql);
}

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  await pg.exec(schemaSql());
  const wrap = (s: any, inTx: boolean): Db => ({
    query: async (text, params = []) => (await s.query(text, params)).rows as any,
    tx: (fn) => (inTx ? fn(wrap(s, true)) : pg.transaction((t) => fn(wrap(t, true)))) as any,
  });
  return wrap(pg, false);
}
