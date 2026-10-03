import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { brl, getConfig, getMySession } from '../api';
import { CATALOG_SIZE, QUESTIONS, QUIZ_MINUTES } from '../../shared/quiz';
import { DimIcon } from '../components/Icons';
import { FAQ } from '../../shared/seo';

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
      <span className="pill">Teste vocacional grátis</span>
      <h1 style={{ marginTop: 10 }}>Qual caminho profissional vale a pena você testar?</h1>
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
        <h3>O que você recebe</h3>
        <ol className="journey">
          <li>
            <span className="j-icon"><DimIcon dim="A" size={20} /></span>
            <div><strong>Seu perfil de interesses</strong><span>{QUESTIONS.length} frases rápidas, cerca de {QUIZ_MINUTES} minutos. Você vê quais tipos de tarefa te dão mais energia.</span></div>
          </li>
          <li>
            <span className="j-icon"><DimIcon dim="O" size={20} /></span>
            <div><strong>Os 5 caminhos que mais combinam com você</strong><span>Entre {CATALOG_SIZE} caminhos, com a sua % de afinidade e o motivo, citando suas próprias respostas.</span></div>
          </li>
          <li>
            <span className="j-icon"><DimIcon dim="P" size={20} /></span>
            <div><strong>Um plano de 7 dias para testar na prática</strong><span>Uma tarefa curta por dia para sentir a rotina antes de decidir qualquer coisa.</span></div>
          </li>
        </ol>
        <div className="sample" aria-label="Exemplo de mapa">
          <div className="sample-label">Exemplo de mapa</div>
          <div className="sample-card">
            <div className="sc-head">
              <span className="sc-name"><DimIcon dim="S" size={18} />Cuidados em saúde</span>
              <span className="match">87% de afinidade</span>
            </div>
            <div className="sc-why">Você marcou “Muito a ver comigo” em “Fico bem quando consigo cuidar de alguém…”</div>
          </div>
          <div className="sample-card">
            <div className="sc-head">
              <span className="sc-name"><DimIcon dim="C" size={18} />UX/UI design</span>
              <span className="match">82% de afinidade</span>
            </div>
            <div className="sc-why">Você marcou “Bastante a ver” em “Gosto de cuidar do visual ou do jeito de apresentar algo…”</div>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 12 }}>{free ? 'Grátis, sem pagamento e sem cartão.' : 'Não pedimos seus contatos para mostrar a prévia.'}</p>
      </div>
      <section className="faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Perguntas frequentes</h2>
        {FAQ.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p className="small">{f.a}</p>
          </details>
        ))}
      </section>
      <p className="small"><Link to="/meus-mapas">{free ? "Já fiz o teste e quero abrir meu mapa" : "Já comprei e quero acessar meu mapa"}</Link></p>
    </div>
  );
}
