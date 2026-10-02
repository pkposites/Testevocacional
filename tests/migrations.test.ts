import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import { schemaSql } from '../server/db';
import { REPAIR_JSONB_SQL } from '../server/db/repair';

async function columns(pg: PGlite) {
  const r = await pg.query<{ t: string; c: string; n: string }>(
    `select table_name t, column_name c, is_nullable n from information_schema.columns where table_schema = 'public' order by 1, 2`,
  );
  return r.rows;
}

describe('migrações da Netlify', () => {
  it('001…004 chegam ao mesmo esquema de schema.sql', async () => {
    const migrated = new PGlite();
    for (const m of ['001_init', '002_whatsapp', '003_free_mode', '004_indexes']) await migrated.exec(readFileSync(`netlify/database/migrations/${m}/migration.sql`, 'utf8'));
    const fresh = new PGlite();
    await fresh.exec(schemaSql());
    expect(await columns(migrated)).toEqual(await columns(fresh));
  });

  it('correção única recupera jsonb gravado como string pelo driver', async () => {
    const pg = new PGlite();
    await pg.exec(schemaSql());
    const ans = JSON.stringify({ Q01: 3, Q02: 4 });
    const spread = { ...(ans as any), Q01: 3, Q02: 4 }; // o que o PUT fazia com a string
    await pg.query(`insert into quiz_sessions (session_token_hash, quiz_version, answers, context, attribution) values ('h','quiz-v1',$1::jsonb,$2::jsonb,$3::jsonb)`, [
      JSON.stringify(JSON.stringify(spread)),
      JSON.stringify(JSON.stringify({ moment: 'change', dailyTime: 60 })),
      JSON.stringify([JSON.stringify({ utm_source: 'meta' }), JSON.stringify({ consent: 'granted' })]),
    ]);
    await pg.exec(REPAIR_JSONB_SQL);
    const r = (await pg.query<any>('select answers, context, attribution from quiz_sessions')).rows[0];
    expect(r.answers).toEqual({ Q01: 3, Q02: 4 });
    expect(r.context).toEqual({ moment: 'change', dailyTime: 60 });
    expect(r.attribution).toEqual({ utm_source: 'meta', consent: 'granted' });
  });
});
