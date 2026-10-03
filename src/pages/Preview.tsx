import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { maskBrPhone, normalizeBrPhone } from '../../shared/phone';
import { CATALOG_SIZE, QUESTIONS } from '../../shared/quiz';
import { DimIcon, LockIcon } from '../components/Icons';
import { api, brl, getConfig, getMySession, storage, type PublicConfig } from '../api';
import { getConsent, metaCookies, track } from '../analytics';

type Summary = { topDimensions: { id: string; label: string }[]; explanation: string; broadProfile: boolean };

export function Preview() {
  const nav = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topMatch, setTopMatch] = useState<number | null>(null);
  const [purchased, setPurchased] = useState<string | null>(null);
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [contactOk, setContactOk] = useState(false);
  const [publicName, setPublicName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    getConfig().then(setCfg).catch(() => undefined);
    (async () => {
      try {
        const s = await getMySession();
        if (!s || s.progress < QUESTIONS.length) return nav('/teste', { replace: true });
        const r = await api('POST', '/api/results');
        setTopMatch(typeof r.top_match === 'number' ? r.top_match : null);
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

  async function submitFree(e: React.FormEvent) {
    e.preventDefault();
    if (!resultId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api('POST', '/api/leads', {
        result_id: resultId, buyer_name: name, buyer_phone: phone, contact_consent: contactOk, public_name_ok: publicName,
        marketing_opt_in: contactOk, consent: getConsent(), ...metaCookies(),
      });
      track('Lead', { eventId: r.event_id });
      nav(`/mapa/${r.result_id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

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
        result_id: resultId, buyer_name: name, buyer_phone: phone, marketing_opt_in: optIn, consent: getConsent(), ...metaCookies(),
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

  if (!summary || !cfg) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;
  const price = brl(cfg?.price_cents ?? 1450);

  if (cfg.offer_mode === 'free') {
    return (
      <div className="wrap">
        <span className="pill">Sua prévia</span>
        <h1 style={{ marginTop: 10 }}>
          {summary.broadProfile ? 'Seu perfil reúne interesses variados' : `Você prefere ${summary.topDimensions[0].label} e ${summary.topDimensions[1].label}`}
        </h1>
        <p>{summary.explanation}</p>

        <section className="next-steps" aria-labelledby="next-title">
          <h2 id="next-title">O que acontece agora</h2>
          <p className="next-lead">Você vai descobrir <strong>qual profissão mais se encaixa no seu perfil</strong> e <strong>como começar a entrar nela</strong>.</p>
          <ol>
            <li>
              <span className="ns-num">1</span>
              <div>
                <strong>Seu Mapa da Carreira · grátis</strong>
                <span>As 5 profissões que mais combinam com você, o porquê de cada uma (com base nas suas respostas) e um plano de 7 dias para testar.</span>
              </div>
            </li>
            <li>
              <span className="ns-num">2</span>
              <div>
                <strong>Diagnóstico prático da sua profissão nº 1{cfg.diagnostic_mode === 'paid' && cfg.diagnostic_price_cents ? ` · ${brl(cfg.diagnostic_price_cents)}` : ''}</strong>
                <span>Como começar a ingressar: a formação que a área pede de verdade, um plano de 4 semanas no seu ritmo, a prova prática para mostrar e onde procurar as primeiras vagas.{cfg.diagnostic_mode === 'paid' ? ' Opcional, você decide depois de ver o mapa.' : ''}</span>
              </div>
            </li>
          </ol>
        </section>

        {purchased ? (
          <div className="card">
            <div className="status ok">Seu mapa já está liberado.</div>
            <Link className="btn" to={`/mapa/${purchased}`}>Abrir meu mapa</Link>
          </div>
        ) : (
          <form className="card stack lead-card" onSubmit={submitFree} noValidate>
            <h2 style={{ marginBottom: 0 }}>Seu mapa completo está pronto, e é grátis</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Comparamos suas {QUESTIONS.length} respostas com {CATALOG_SIZE} caminhos. Estes são os 5 que mais combinam com você:
            </p>
            <div className="locked-map" aria-label="Prévia bloqueada dos seus 5 caminhos">
              {[0, 1, 2, 3, 4].map((i) => {
                const dims = summary.topDimensions.map((d) => d.id);
                return (
                  <div key={i} className={`locked-row${i === 0 ? ' first' : ''}`}>
                    <span className="lr-pos">{i + 1}º</span>
                    <span className="lr-icon"><DimIcon dim={dims[i % dims.length]} size={17} /></span>
                    <span className="lr-name" aria-hidden="true" />
                    {i === 0 && topMatch !== null ? <span className="lr-match">{topMatch}% de afinidade</span> : <LockIcon size={16} className="lr-lock" />}
                  </div>
                );
              })}
            </div>
            <ul className="list" style={{ margin: 0 }}>
              <li>Os 5 caminhos, com a sua % de afinidade em cada um</li>
              <li>Por que cada um combina com você, citando suas próprias respostas</li>
              <li>O que pode pesar em cada rotina e um plano de 7 dias para testar</li>
            </ul>
            <p className="small muted" style={{ margin: 0 }}>Informe seu nome e WhatsApp para liberar e guardar o seu mapa.</p>
            <div>
              <label htmlFor="name">Primeiro nome</label>
              <input id="name" type="text" autoComplete="given-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="phone">WhatsApp com DDD</label>
              <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" required
                value={phone} onChange={(e) => setPhone(maskBrPhone(e.target.value))} />
              {phone.replace(/\D/g, '').length >= 11 && !normalizeBrPhone(phone) && (
                <p className="small" style={{ color: 'var(--error)', marginTop: 6 }}>Confira o número: use DDD + celular com 9 dígitos.</p>
              )}
            </div>
            <label className="check">
              <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} required />
              <span>Quero receber meu resultado e contatos sobre ele pelo WhatsApp.</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={publicName} onChange={(e) => setPublicName(e.target.checked)} />
              <span>Pode mostrar meu primeiro nome e meu 1º caminho nas notificações do site (opcional).</span>
            </label>
            {error && <div className="status error" role="alert">{error}</div>}
            <button className="btn" type="submit" disabled={busy || name.trim().length < 2 || !normalizeBrPhone(phone) || !contactOk}>
              {busy ? <><span className="spinner" /> Liberando…</> : 'Ver meu mapa completo grátis'}
            </button>
            <p className="small muted" style={{ margin: 0 }}>
              Seus dados não são compartilhados. Veja a <Link to="/privacidade">política de privacidade</Link> e os <Link to="/termos">termos de uso</Link>.
            </p>
          </form>
        )}

        <div className="card soft">
          <h3>Exercício rápido para hoje</h3>
          <p>Anote uma tarefa que te dá energia e uma que te desgasta.</p>
          <p className="small muted">Compare com suas preferências acima: elas costumam aparecer nas tarefas que dão energia.</p>
        </div>
        <p className="small muted">As sugestões consideram somente os caminhos disponíveis neste catálogo.</p>
        <p className="small" style={{ marginTop: 16 }}><Link to="/teste">Revisar minhas respostas</Link></p>
      </div>
    );
  }

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
            <div className="status warn">Liberação conferida manualmente: seu acesso chega pelo WhatsApp em {cfg.manual_delivery_sla} após a confirmação do Pix.</div>
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
          <h3>Para identificar sua compra</h3>
          <p className="small muted">Com seu WhatsApp e o código do pedido, você abre o mapa em qualquer aparelho.</p>
          <div>
            <label htmlFor="name">Primeiro nome</label>
            <input id="name" type="text" autoComplete="given-name" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="phone">WhatsApp com DDD</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" required
              value={phone} onChange={(e) => setPhone(maskBrPhone(e.target.value))} />
            {phone.replace(/\D/g, '').length >= 11 && !normalizeBrPhone(phone) && (
              <p className="small" style={{ color: 'var(--error)', marginTop: 6 }}>Confira o número: use DDD + celular com 9 dígitos.</p>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
            <span>Quero receber novidades e ofertas pelo WhatsApp (opcional).</span>
          </label>
          <div className="card soft small" style={{ margin: 0 }}>
            <strong>Mapa da Carreira</strong> · {price} · Pix via {cfg?.provider === 'kiwify' ? 'Kiwify' : 'Mercado Pago'}
            <br />A compra cobre este mapa, gerado com as respostas atuais. Refazer o teste gera outro resultado.
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          <button className="btn" type="submit" disabled={busy || name.trim().length < 2 || !normalizeBrPhone(phone)}>
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
