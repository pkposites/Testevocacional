import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, brl, getConfig, storage, type PublicConfig } from '../api';
import { getConsent, metaCookies, track } from '../analytics';

type Summary = { topDimensions: { id: string; label: string }[]; explanation: string; broadProfile: boolean };

export function Preview() {
  const nav = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    getConfig().then(setCfg).catch(() => undefined);
    (async () => {
      try {
        const s = await api('GET', '/api/quiz/sessions/me');
        if (s.progress < 12) return nav('/teste', { replace: true });
        const r = s.result ?? (await api('POST', '/api/results'));
        setResultId(r.result_id);
        setSummary(r.summary);
        if (s.purchased_result_id === r.result_id) setPurchased(r.result_id);
        if (s.open_order) setOpenOrder(s.open_order.order_id);
        track('ViewResult', { eventId: `vr_${r.result_id}`, serverLog: true });
      } catch {
        nav('/teste', { replace: true });
      }
    })();
  }, [nav]);

  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resultId) return;
    setBusy(true);
    setError(null);
    const keyName = `mc_idem_${resultId}`;
    const idem = storage.get(keyName) ?? crypto.randomUUID();
    storage.set(keyName, idem);
    try {
      const o = await api('POST', '/api/orders', {
        result_id: resultId, buyer_name: name, buyer_email: email, marketing_opt_in: optIn, consent: getConsent(), ...metaCookies(),
      }, { 'Idempotency-Key': idem });
      track('InitiateCheckout', { eventId: `ic_${o.order_id}`, value: o.amount_cents / 100 });
      if (o.next_action === 'redirect' && o.checkout_url) {
        window.location.assign(o.checkout_url);
        return;
      }
      nav(o.status === 'paid' ? `/mapa/${o.result_id}` : `/pagamento/${o.order_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!summary) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;
  const price = brl(cfg?.price_cents ?? 1450);

  return (
    <div className="wrap">
      <span className="pill">Sua prévia gratuita</span>
      <h1 style={{ marginTop: 10 }}>
        {summary.broadProfile ? 'Seu perfil reúne interesses variados' : `Você prefere ${summary.topDimensions[0].label} e ${summary.topDimensions[1].label}`}
      </h1>
      <p>{summary.explanation}</p>
      {summary.broadProfile && (
        <div className="status info">Seu ranking ficou pouco diferenciado. O mapa vai sugerir cinco experiências para você explorar, sem apontar uma profissão ideal.</div>
      )}

      <div className="card soft">
        <h3>Exercício gratuito para hoje</h3>
        <p>Anote uma tarefa que te dá energia e uma que te desgasta.</p>
        <p className="small muted">Compare com suas preferências acima: elas costumam aparecer nas tarefas que dão energia.</p>
      </div>
      <p className="small muted">As sugestões consideram somente os caminhos disponíveis neste catálogo.</p>

      {purchased ? (
        <div className="card">
          <div className="status ok">Você já desbloqueou este mapa.</div>
          <Link className="btn" to={`/mapa/${purchased}`}>Abrir meu mapa</Link>
        </div>
      ) : (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h2>Seu mapa de caminhos profissionais está pronto</h2>
          <ul className="list">
            <li>Cinco caminhos sugeridos e os motivos</li>
            <li>O que pode te incomodar em cada rotina</li>
            <li>O primeiro passo para explorar cada área</li>
            <li>Um plano de sete dias para testar o caminho que escolher</li>
          </ul>
          <div className="price">{price}</div>
          <p className="small muted">Pagamento único via Pix. Acesso após confirmação. Sem assinatura.</p>
          {cfg?.delivery_mode === 'manual' && (
            <div className="status warn">Liberação conferida manualmente: seu acesso chega por e-mail em {cfg.manual_delivery_sla} após a confirmação do Pix.</div>
          )}
          {!showForm && (
            <button className="btn" onClick={() => { track('CheckoutClick', { serverLog: true }); setShowForm(true); }}>
              Desbloquear meu mapa por {price}
            </button>
          )}
          {openOrder && !showForm && (
            <p className="small" style={{ marginTop: 10 }}><Link to={`/pagamento/${openOrder}`}>Já gerei um Pix: ver pagamento</Link></p>
          )}
        </div>
      )}

      {showForm && !purchased && (
        <form ref={formRef} className="card stack" onSubmit={submit} noValidate>
          <h3>Para onde enviamos seu acesso?</h3>
          <p className="small muted">Usamos seu e-mail para você recuperar a compra em qualquer aparelho.</p>
          <div>
            <label htmlFor="name">Primeiro nome</label>
            <input id="name" type="text" autoComplete="given-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Quero receber novidades e ofertas por e-mail (opcional).</span>
          </label>
          <div className="card soft small" style={{ margin: 0 }}>
            <strong>Mapa da Carreira</strong> · {price} · Pix via {cfg?.provider === 'kiwify' ? 'Kiwify' : 'Mercado Pago'}
            <br />A compra cobre este mapa, gerado com as respostas atuais. Refazer o teste gera outro resultado.
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy || name.trim().length < 2 || !email.includes('@')}>
            {busy ? <><span className="spinner" /> Gerando Pix…</> : `Gerar Pix de ${price}`}
          </button>
          <p className="small muted">
            Ao continuar, você concorda com as <Link to="/termos">condições de venda</Link> e a <Link to="/privacidade">política de privacidade</Link>.
            Dúvidas? <Link to="/ajuda">Fale com o suporte</Link>.
          </p>
        </form>
      )}
      <p className="small" style={{ marginTop: 16 }}><Link to="/teste">Revisar minhas respostas</Link></p>
    </div>
  );
}
