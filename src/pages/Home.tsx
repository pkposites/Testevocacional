import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, brl, getConfig } from '../api';

export function Home() {
  const nav = useNavigate();
  const [price, setPrice] = useState(1450);
  const [resume, setResume] = useState<{ progress: number; hasResult: boolean } | null>(null);
  useEffect(() => {
    getConfig().then((c) => setPrice(c.price_cents)).catch(() => undefined);
    api('GET', '/api/quiz/sessions/me')
      .then((s) => (s.progress > 0 ? setResume({ progress: s.progress, hasResult: !!s.result }) : null))
      .catch(() => undefined);
  }, []);
  return (
    <div className="wrap">
      <h1>Qual caminho profissional vale a pena você testar?</h1>
      <p>
        Responda 12 perguntas sobre o que você gosta de fazer. Veja uma prévia gratuita e, se quiser, desbloqueie seu mapa com
        cinco caminhos e um plano de sete dias por {brl(price)}.
      </p>
      {resume ? (
        <div className="stack">
          <button className="btn" onClick={() => nav(resume.hasResult ? '/previa' : '/teste')}>
            {resume.hasResult ? 'Ver minha prévia' : `Continuar teste (${resume.progress} de 12)`}
          </button>
          <button className="btn secondary" onClick={() => nav('/teste?novo=1')}>Começar um novo teste</button>
        </div>
      ) : (
        <button className="btn" onClick={() => nav('/teste')}>Começar meu teste</button>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>
        Uma ferramenta de exploração baseada nas suas respostas. Não é avaliação psicológica nem garantia de carreira.
      </p>

      <div className="card soft" style={{ marginTop: 24 }}>
        <h3>Como funciona</h3>
        <ol className="steps">
          <li>Você responde 12 frases sobre atividades que gosta ou não de fazer. Leva cerca de 3 minutos.</li>
          <li>Vê de graça suas duas preferências mais fortes e um exercício rápido.</li>
          <li>Se quiser, desbloqueia o mapa completo: cinco caminhos, os motivos e um plano prático de 7 dias.</li>
        </ol>
        <p className="small muted">Não pedimos e-mail para mostrar a prévia.</p>
      </div>
      <p className="small"><Link to="/meus-mapas">Já comprei e quero acessar meu mapa</Link></p>
    </div>
  );
}
