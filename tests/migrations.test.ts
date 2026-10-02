import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../server/db';

async function columns(pg: PGlite) {
  const r = await pg.query<{ t: string; c: string; n: string }>(
    `select table_name t, column_name c, is_nullable n from information_schema.columns where table_schema = 'public' order by 1, 2`,
  );
  return r.rows;
}

describe('migrações da Netlify', () => {
  it('001 + 002 + 003 chegam ao mesmo esquema de schema.sql', async () => {
    const migrated = new PGlite();
    for (const m of ['001_init', '002_whatsapp', '003_free_mode', '004_indexes']) await migrated.exec(readFileSync(`netlify/database/migrations/${m}/migration.sql`, 'utf8'));
    const fresh = new PGlite();
    await fresh.exec(schemaSql());
    expect(await columns(migrated)).toEqual(await columns(fresh));
  });
});
