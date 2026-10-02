import { describe, expect, it } from 'vitest';
import { CATALOG_SIZE, QUESTIONS, type Answers } from '../shared/quiz';
import { CAREERS } from '../server/content/careers.v1';
import { affinity, attentionText, buildPreview, careerVector, computeResult, isBroadProfile, rankCareers, reasonDims, userVector } from '../server/scoring';

/** Respostas por área; se vierem só duas, a terceira repete a segunda. */
function answersFrom(byDim: Record<string, number[]>): Answers {
  const a: Answers = {};
  const seen: Record<string, number> = {};
  for (const q of QUESTIONS) {
    const i = seen[q.dimension] ?? 0;
    const vals = byDim[q.dimension];
    a[q.id] = vals[Math.min(i, vals.length - 1)];
    seen[q.dimension] = i + 1;
  }
  return a;
}

const all = (n: number) => Object.fromEntries(QUESTIONS.map((q) => [q.id, n])) as Answers;

describe('cálculo da especificação', () => {
  it('d = (média − 1) / 4', () => {
    const u = userVector(answersFrom({ P: [1, 1, 1], A: [5, 5, 5], C: [2, 4, 3], S: [2, 2, 2], N: [1, 2, 3], O: [4, 5, 3] }));
    expect(u).toEqual({ P: 0, A: 1, C: 0.5, S: 0.25, N: 0.25, O: 0.75 });
  });

  it('afinidade v2: formato do perfil pesa mais que o nível das respostas', () => {
    const v = careerVector(CAREERS[1]); // Análise de dados 1,5,2,2,1,5 → 0,1,.25,.25,0,1
    expect(v).toEqual({ P: 0, A: 1, C: 0.25, S: 0.25, N: 0, O: 1 });
    const igual = affinity(v, v);
    const oposto = affinity({ P: 1, A: 0, C: 0.75, S: 0.75, N: 1, O: 0 }, v);
    expect(igual).toBeGreaterThan(95);
    expect(oposto).toBeLessThan(10);
    // Mesmo formato, respostas mais baixas: a ordem entre carreiras não muda.
    const alto = { P: 0.25, A: 1, C: 0.5, S: 0.25, N: 0.25, O: 0.75 };
    const baixo = { P: 0, A: 0.75, C: 0.25, S: 0, N: 0, O: 0.5 };
    expect(rankCareers(alto).slice(0, 3).map((r) => r.id)).toEqual(rankCareers(baixo).slice(0, 3).map((r) => r.id));
  });

  it('nenhuma carreira domina: em respostas aleatórias, nenhuma fica em 1º para mais de 12% das pessoas', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const top1: Record<string, number> = {};
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const a: Answers = {};
      for (const q of QUESTIONS) a[q.id] = 1 + Math.floor(rnd() * 5);
      const id = rankCareers(userVector(a))[0].id;
      top1[id] = (top1[id] ?? 0) + 1;
    }
    for (const c of CAREERS) {
      expect((top1[c.id] ?? 0) / N).toBeLessThan(0.12);
      expect((top1[c.id] ?? 0) / N).toBeGreaterThan(0.005);
    }
  });

  it('empate é resolvido pelo ID crescente', () => {
    // Vetor do usuário equidistante de todos não existe; testamos a regra direto com ranking estável.
    const u = { P: 0.5, A: 0.5, C: 0.5, S: 0.5, N: 0.5, O: 0.5 };
    const r = rankCareers(u);
    for (let i = 1; i < r.length; i++) {
      if (Math.abs(r[i].affinity - r[i - 1].affinity) < 1e-12) expect(r[i].id > r[i - 1].id).toBe(true);
      else expect(r[i].affinity).toBeLessThan(r[i - 1].affinity);
    }
  });

  it('três perfis distintos produzem resultados coerentes', () => {
    const analitico = computeResult(answersFrom({ P: [1, 1], A: [5, 5], C: [2, 2], S: [1, 2], N: [1, 1], O: [5, 5] }), { moment: 'first', dailyTime: 15 });
    expect(analitico.rankedCareerIds[0]).toBe('02'); // Análise de dados
    expect(analitico.snapshot.broadProfile).toBe(false);

    const pessoas = computeResult(answersFrom({ P: [1, 2], A: [3, 3], C: [3, 4], S: [5, 5], N: [2, 2], O: [4, 4] }), { moment: 'change', dailyTime: 30 });
    expect(['09', '10']).toContain(pessoas.rankedCareerIds[0]);

    const pratico = computeResult(answersFrom({ P: [5, 5], A: [4, 4], C: [1, 2], S: [3, 3], N: [1, 1], O: [4, 4] }), { moment: 'explore', dailyTime: 60 });
    expect(pratico.rankedCareerIds[0]).toBe('12'); // Manutenção e suporte técnico

    for (const r of [analitico, pessoas, pratico]) {
      expect(r.rankedCareerIds).toHaveLength(5);
      expect(new Set(r.rankedCareerIds).size).toBe(5);
    }
  });

  it('respostas todas iguais → preferências amplas, ainda com cinco caminhos', () => {
    const r = computeResult(all(3), { moment: 'first', dailyTime: 15 });
    expect(r.snapshot.broadProfile).toBe(true);
    expect(r.snapshot.cards).toHaveLength(5);
    expect(buildPreview(all(5)).broadProfile).toBe(true);
  });

  it('amplitude < 0,25 também é perfil amplo', () => {
    const a = answersFrom({ P: [3, 3], A: [3, 4], C: [3, 3], S: [3, 4], N: [3, 3], O: [4, 3] });
    expect(isBroadProfile(a, userVector(a))).toBe(true);
    const b = answersFrom({ P: [1, 1], A: [3, 3], C: [3, 3], S: [3, 3], N: [3, 3], O: [3, 3] });
    expect(isBroadProfile(b, userVector(b))).toBe(false);
  });

  it('razões: duas dimensões com maior min(u,v), desempate P,A,C,S,N,O', () => {
    const u = { P: 1, A: 1, C: 1, S: 1, N: 1, O: 1 };
    // Gestão de tráfego v = 0,1,.5,.25,.5,.75 → min = v → A(1) e O(.75)
    expect(reasonDims(u, CAREERS[0])).toEqual(['A', 'O']);
    const flat = { P: 0.1, A: 0.1, C: 0.1, S: 0.1, N: 0.1, O: 0.1 };
    expect(reasonDims(flat, CAREERS[0])).toEqual(['A', 'C']); // P da carreira é 0
  });

  it('ponto de atenção: gap > 0,4 gera texto da atividade; senão, texto editorial', () => {
    const low = { P: 0, A: 0, C: 0, S: 0, N: 0, O: 0 };
    expect(attentionText(low, CAREERS[0])).toMatch(/^Esta rotina costuma exigir investigar e comparar informações/);
    const high = { P: 1, A: 1, C: 1, S: 1, N: 1, O: 1 };
    expect(attentionText(high, CAREERS[0])).toBe(CAREERS[0].attention);
  });

  it('todos os caminhos têm conteúdo completo e o tamanho público do catálogo confere', () => {
    expect(CAREERS).toHaveLength(CATALOG_SIZE);
    expect(new Set(CAREERS.map((c) => c.id)).size).toBe(CAREERS.length);
    expect(new Set(CAREERS.map((c) => c.name)).size).toBe(CAREERS.length);
    for (const c of CAREERS) for (const h of c.evidenceHints ?? []) expect(QUESTIONS.some((q) => q.id === h)).toBe(true);
    for (const c of CAREERS) {
      expect(c.routine && c.attention && c.skill && c.search).toBeTruthy();
      expect(c.days).toHaveLength(7);
      c.days.forEach((d) => expect(d.length).toBeGreaterThan(5));
    }
  });

  it('prévia não expõe ranking', () => {
    const p = buildPreview(answersFrom({ P: [1, 1], A: [5, 5], C: [2, 2], S: [1, 2], N: [1, 1], O: [5, 5] }));
    expect(p.topDimensions.map((d) => d.id)).toEqual(['A', 'O']);
    const json = JSON.stringify(p);
    for (const c of CAREERS) expect(json).not.toContain(c.name);
  });

  it('entregável: evidências citam só respostas reais (4–5), atenção cita resposta baixa, e perfis diferentes geram mapas diferentes', () => {
    const a = answersFrom({ P: [2, 3], A: [5, 5], C: [4, 4], S: [2, 1], N: [3, 2], O: [4, 4] });
    const r = computeResult(a, { moment: 'change', dailyTime: 30 }).snapshot;
    expect(r.profile!.map((b) => b.id)).toEqual(['A', 'C', 'O', 'P', 'N', 'S']);
    expect(r.profile![0].score).toBe(100);
    for (const c of r.cards) {
      expect(c.match).toBeGreaterThan(0);
      for (const e of c.evidence!) {
        const q = QUESTIONS.find((x) => e.includes(x.text.replace(/\.$/, '')))!;
        expect(q).toBeTruthy();
        expect(a[q.id]).toBeGreaterThanOrEqual(4);
      }
      if (c.tension) {
        const q = QUESTIONS.find((x) => c.tension!.includes(x.text.replace(/\.$/, '')))!;
        expect(a[q.id]).toBeLessThanOrEqual(2);
      }
    }
    expect(r.cards.map((c) => c.match)).toEqual([...r.cards.map((c) => c.match!)].sort((x, y) => y - x));
    expect(r.leftOut).toHaveLength(2);
    // Colaboração foi a área mais baixa: o motivo dos caminhos de fora cita isso.
    expect(r.leftOut!.some((l) => l.reason.includes('troca e colaboração'))).toBe(true);
    for (const l of r.leftOut!) expect(r.cards.map((c) => c.name)).not.toContain(l.name);

    const pessoas = computeResult(answersFrom({ P: [1, 2], A: [2, 2], C: [3, 3], S: [5, 5], N: [5, 4], O: [3, 3] }), { moment: 'first', dailyTime: 15 }).snapshot;
    expect(pessoas.cards[0].name).not.toBe(r.cards[0].name);
    expect(pessoas.cards.map((c) => c.careerId)).not.toEqual(r.cards.map((c) => c.careerId));
  });
});
