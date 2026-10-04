import { useEffect, useState } from 'react';
import { getConfig } from './api';
import { SocialProof } from './components/SocialProof';
import { seoFor } from '../shared/seo';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { getConsent, setConsent, track } from './analytics';
import { Access } from './pages/Access';
import { Admin } from './pages/Admin';
import { Help } from './pages/Help';
import { Home } from './pages/Home';
import { Legal } from './pages/Legal';
import { MapPage } from './pages/MapPage';
import { DiagnosticPage } from './pages/DiagnosticPage';
import { MyMaps } from './pages/MyMaps';
import { Payment } from './pages/Payment';
import { Preview } from './pages/Preview';
import { Quiz } from './pages/Quiz';

function ConsentBanner() {
  const [show, setShow] = useState(getConsent() === 'unknown');
  if (!show) return null;
  const choose = async (v: 'granted' | 'denied') => {
    setShow(false);
    await setConsent(v);
  };
  return (
    <div className="consent" role="dialog" aria-label="Preferências de medição">
      <div className="inner">
        <p>Usamos cookies de medição para entender quais anúncios trazem visitas. Você pode recusar sem perder nenhuma função. <Link to="/privacidade">Saiba mais</Link>.</p>
        <div className="row">
          <button className="btn secondary" onClick={() => choose('denied')}>Recusar</button>
          <button className="btn" onClick={() => choose('granted')}>Aceitar</button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const loc = useLocation();
  useEffect(() => {
    // Título, descrição, endereço oficial e indexação por página (o HTML inicial já vem certo do build).
    const seo = seoFor(loc.pathname);
    document.title = seo.title;
    const meta = (sel: string, attr: string, val: string) => {
      let el = document.head.querySelector(sel) as HTMLMetaElement | HTMLLinkElement | null;
      if (!el) {
        el = document.createElement(sel.startsWith('link') ? 'link' : 'meta') as HTMLMetaElement;
        const m = sel.match(/\[(\w+)="([^"]+)"\]/);
        if (m) el.setAttribute(m[1], m[2]);
        document.head.appendChild(el);
      }
      el.setAttribute(attr, val);
    };
    meta('meta[name="description"]', 'content', seo.description);
    meta('meta[name="robots"]', 'content', seo.index ? 'index,follow' : 'noindex,nofollow');
    if (seo.index) meta('link[rel="canonical"]', 'href', `${window.location.origin}${seo.path === '/' ? '/' : seo.path}`);
  }, [loc.pathname]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (loc.pathname === '/') track('PageView', { serverLog: true });
  }, [loc.pathname]);
  const isAdmin = loc.pathname.startsWith('/admin');
  const [free, setFree] = useState(true);
  useEffect(() => void getConfig().then((c) => setFree(c.offer_mode === 'free')).catch(() => undefined), []);
  // Prova social (dados reais) na página inicial, na prévia e no mapa; fora do teste para não distrair as respostas.
  const showProof = loc.pathname === '/' || loc.pathname === '/previa' || loc.pathname.startsWith('/mapa/');
  return (
    <>
      <header className="topbar no-print">
        <Link to="/" className="brand">Mapa da <span>Carreira</span></Link>
        {!isAdmin && <Link to="/meus-mapas" className="small">{free ? 'Já fiz o teste' : 'Já comprei'}</Link>}
      </header>
      {showProof && <SocialProof />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/teste" element={<Quiz />} />
          <Route path="/previa" element={<Preview />} />
          <Route path="/pagamento/:orderId" element={<Payment />} />
          <Route path="/mapa/:resultId" element={<MapPage />} />
          <Route path="/diagnostico/:resultId" element={<DiagnosticPage />} />
          <Route path="/acesso" element={<Access />} />
          <Route path="/meus-mapas" element={<MyMaps />} />
          <Route path="/ajuda" element={<Help />} />
          <Route path="/privacidade" element={<Legal kind="privacy" />} />
          <Route path="/termos" element={<Legal kind="terms" />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<div className="wrap"><h1>Página não encontrada</h1><Link to="/">Voltar ao início</Link></div>} />
        </Routes>
      </main>
      {!isAdmin && (
        <footer className="footer no-print">
          <Link to="/termos">{free ? 'Termos de uso' : 'Condições de venda'}</Link>
          <Link to="/privacidade">Privacidade</Link>
          <Link to="/ajuda">Ajuda</Link>
          <Link to="/acesso">Recuperar acesso</Link>
          <span>Ferramenta de exploração. Não é avaliação psicológica nem garantia de carreira.</span>
        </footer>
      )}
      {!isAdmin && <ConsentBanner />}
    </>
  );
}
