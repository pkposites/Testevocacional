import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { schemaSql } from '../server/db';
import { REPAIR_JSONB_SQL } from '../server/db/repair';
import { analyticAnswers, Client, makeApp } from './helpers';

describe('sessões gravadas antes da correção do driver', () => {
  it('sessão com respostas gigantes/em texto é consertada na hora e o teste segue até a prévia', async () => {
    const app = await makeApp({ OFFER_MODE: 'free' });
    const c = new Client(app);
    const created = await c.req('POST', '/api/quiz/sessions', { attribution: { utm_source: 'meta' } });
    // Como o driver antigo deixava: string JSON que crescia a cada resposta, com chaves "0","1",... misturadas.
    const huge = JSON.stringify({ ...'x'.repeat(30000).split(''), Q01: 3 });
    await app.db.query(`update quiz_sessions set answers = to_jsonb($2::text), context = to_jsonb($3::text), attribution = jsonb_build_array($4::text) where id = $1`, [
      created.body.session_id, huge, '{"moment":"change"}', '{"utm_source":"meta"}',
    ]);
    const me = await c.req('GET', '/api/quiz/sessions/me');
    expect(me.status).toBe(200);
    expect(me.body.answers).toEqual({});
    const put = await c.req('PUT', '/api/quiz/sessions/me', { answers: analyticAnswers(), context: { moment: 'change', dailyTime: 30 } });
    expect(put.status).toBe(200);
    expect((await c.req('POST', '/api/results', {})).status).toBe(200);
    const [row] = await app.db.query<any>(`select jsonb_typeof(answers) a, jsonb_typeof(attribution) t, pg_column_size(answers) n from quiz_sessions`);
    expect(row).toMatchObject({ a: 'object', t: 'object' });
    expect(row.n).toBeLessThan(2000);
  });

  it('correção em lote zera valores enormes sem tentar lê-los', async () => {
    const pg = new PGlite();
    await pg.exec(schemaSql());
    // md5 em sequência não comprime: o valor fica de fato grande no disco.
    await pg.exec(`insert into quiz_sessions (session_token_hash, quiz_version, answers)
      select 'h', 'quiz-v1', to_jsonb(string_agg(md5(i::text), '')) from generate_series(1, 5000) i`);
    await pg.exec(REPAIR_JSONB_SQL);
    const { rows } = await pg.query<any>(`select answers from quiz_sessions`);
    expect(rows[0].answers).toEqual({});
  });
});
