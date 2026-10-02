import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { brl, getConfig, getMySession } from '../api';
import { QUESTIONS, QUIZ_MINUTES } from '../../shared/quiz';

export function Home() {
  const nav = useNavigate();
  const [price, setPrice] = useState(1450);
  const [free, setFree] = useState(true);
  const [resume, setResume] = useState<{ progress: number; hasResult: boolean } | null>(null);
  useEffect(() => {
    getConfig().then((c) => { setPrice(c.price_cents); setFree(c.offer_mode === 'free'); }).catch(() => undefined);
    getMySession()
      .then((s) => (s && s.progress > 0 ? setResume({ progress: s.progress, hasResult: !!s.result }) : null))
      .catch(() => undefined);
  }, []);
  return (
    <div className="wrap">
      <h1>Qual caminho profissional vale a pena você testar?</h1>
      {free ? (
        <p>
          Responda {QUESTIONS.length} perguntas sobre o que você gosta de fazer e receba <strong>grátis</strong> seu mapa com cinco caminhos e um plano de
          sete dias para testar o que mais combina com você.
        </p>
      ) : (
        <p>
          Responda {QUESTIONS.length} perguntas sobre o que você gosta de fazer. Veja uma prévia gratuita e, se quiser, desbloqueie seu mapa com
          cinco caminhos e um plano de sete dias por {brl(price)}.
        </p>
      )}
      {resume ? (
        <div className="stack">
          <button className="btn" onClick={() => nav(resume.hasResult ? '/previa' : '/teste')}>
            {resume.hasResult ? 'Ver minha prévia' : `Continuar teste (${resume.progress} de ${QUESTIONS.length})`}
          </button>
          <button className="btn secondary" onClick={() => nav('/teste?novo=1')}>Começar um novo teste</button>
        </div>
      ) : (
        <button className="btn" onClick={() => nav('/teste')}>{free ? 'Começar meu teste grátis' : 'Começar meu teste'}</button>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>
        Uma ferramenta de exploração baseada nas suas respostas. Não é avaliação psicológica nem garantia de carreira.
      </p>

      <div className="card soft" style={{ marginTop: 24 }}>
        <h3>Como funciona</h3>
        <ol className="steps">
          <li>Você responde {QUESTIONS.length} frases sobre atividades que gosta ou não de fazer. Leva cerca de {QUIZ_MINUTES} minutos.</li>
          <li>Vê suas duas preferências mais fortes e um exercício rápido.</li>
          {free
            ? <li>Informa nome e WhatsApp e recebe o mapa completo: cinco caminhos, os motivos e um plano prático de 7 dias. Tudo grátis.</li>
            : <li>Se quiser, desbloqueia o mapa completo: cinco caminhos, os motivos e um plano prático de 7 dias.</li>}
        </ol>
        <p className="small muted">{free ? 'Sem pagamento e sem cartão.' : 'Não pedimos seus contatos para mostrar a prévia.'}</p>
      </div>
      <p className="small"><Link to="/meus-mapas">{free ? "Já fiz o teste e quero abrir meu mapa" : "Já comprei e quero acessar meu mapa"}</Link></p>
    </div>
  );
}
