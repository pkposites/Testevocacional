import { describe, expect, it } from 'vitest';
import { QUESTIONS, type Answers } from '../shared/quiz';
import { CAREERS } from '../server/content/careers.v1';
import { affinity, attentionText, buildPreview, careerVector, computeResult, isBroadProfile, rankCareers, reasonDims, userVector } from '../server/scoring';

function answersFrom(byDim: Record<string, [number, number]>): Answers {
  const a: Answers = {};
  const seen: Record<string, number> = {};
  for (const q of QUESTIONS) {
    const i = seen[q.dimension] ?? 0;
    a[q.id] = byDim[q.dimension][i];
    seen[q.dimension] = i + 1;
  }
  return a;
}

const all = (n: number) => Object.fromEntries(QUESTIONS.map((q) => [q.id, n])) as Answers;

describe('cálculo da especificação', () => {
  it('d = (média − 1) / 4', () => {
    const u = userVector(answersFrom({ P: [1, 1], A: [5, 5], C: [3, 4], S: [2, 2], N: [1, 2], O: [4, 5] }));
    expect(u).toEqual({ P: 0, A: 1, C: 0.625, S: 0.25, N: 0.125, O: 0.875 });
  });

  it('afinidade = 100 × (1 − Σ|u−v|/6) com vetor editorial ÷ 5', () => {
    const u = { P: 0, A: 1, C: 0.5, S: 0.5, N: 0.5, O: 1 };
    const v = careerVector(CAREERS[0]); // 1,5,3,2,3,4 → 0.2,1,0.6,0.4,0.6,0.8
    const expected = 100 * (1 - (0.2 + 0 + 0.1 + 0.1 + 0.1 + 0.2) / 6);
    expect(affinity(u, v)).toBeCloseTo(expected, 8);
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
    // Gestão de tráfego v = .2,1,.6,.4,.6,.8 → min = v → A(1) e O(.8)
    expect(reasonDims(u, CAREERS[0])).toEqual(['A', 'O']);
    const flat = { P: 0.1, A: 0.1, C: 0.1, S: 0.1, N: 0.1, O: 0.1 };
    expect(reasonDims(flat, CAREERS[0])).toEqual(['P', 'A']);
  });

  it('ponto de atenção: gap > 0,4 gera texto da atividade; senão, texto editorial', () => {
    const low = { P: 0, A: 0, C: 0, S: 0, N: 0, O: 0 };
    expect(attentionText(low, CAREERS[0])).toMatch(/^Esta rotina costuma exigir investigar e comparar informações/);
    const high = { P: 1, A: 1, C: 1, S: 1, N: 1, O: 1 };
    expect(attentionText(high, CAREERS[0])).toBe(CAREERS[0].attention);
  });

  it('todos os 12 caminhos têm conteúdo completo', () => {
    expect(CAREERS).toHaveLength(12);
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
});
