import { CheckIcon } from '../components/Icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, brl, getConfig, supportHref, type PublicConfig } from '../api';
import { track } from '../analytics';

type OrderView = {
  order_id: string;
  public_ref: string;
  result_id: string;
  product?: 'map' | 'diagnostic';
  status: string;
  next_action: 'pay_pix' | 'open_map' | 'open_diagnostic' | 'retry' | 'contact_support' | 'redirect';
  amount_cents: number;
  pix: { qr_code: string; qr_base64?: string; ticket_url?: string; expires_at?: string } | null;
  checkout_url: string | null;
  delivery_mode: 'automatic' | 'manual';
};

const POLL_MS = 5000;

const isDiag = (o: OrderView | null) => o?.product === 'diagnostic';
const destination = (o: OrderView) => (isDiag(o) ? `/diagnostico/${o.result_id}` : `/mapa/${o.result_id}`);
const POLL_WINDOW_MS = 120_000;

function useCountdown(iso?: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!iso) return setLeft(null);
    const tick = () => setLeft(Math.max(0, new Date(iso).getTime() - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return left;
}

export function Payment() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [o, setO] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollStart = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      const v = await api<OrderView>('GET', `/api/orders/${orderId}/status`);
      setO(v);
      setError(null);
      if (v.status === 'paid') {
        track('Purchase', { eventId: `purchase_${v.order_id}`, value: v.amount_cents / 100 });
        setTimeout(() => nav(destination(v)), 1200);
      }
      return v;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [orderId, nav]);

  useEffect(() => {
    getConfig().then(setCfg).catch(() => undefined);
    void refresh();
  }, [refresh]);

  // Consulta a cada 5 s por até 2 min; depois, botão manual.
  useEffect(() => {
    if (!polling || !o || o.status !== 'pending') return;
    const t = setInterval(async () => {
      if (Date.now() - pollStart.current > POLL_WINDOW_MS) {
        setPolling(false);
        return;
      }
      if (document.visibilityState === 'visible') await refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [polling, o, refresh]);

  const left = useCountdown(o?.pix?.expires_at);
  useEffect(() => {
    if (left === 0 && o?.status === 'pending') void refresh();
  }, [left, o?.status, refresh]);

  async function check() {
    setChecking(true);
    await refresh();
    setChecking(false);
  }

  async function retry() {
    setChecking(true);
    try {
      const v = await api<OrderView>('POST', `/api/orders/${orderId}/retry`);
      setO(v);
      pollStart.current = Date.now();
      setPolling(true);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    setChecking(false);
  }

  async function copy() {
    if (!o?.pix) return;
    try {
      await navigator.clipboard.writeText(o.pix.qr_code);
    } catch {
      const ta = document.getElementById('pix-code') as HTMLTextAreaElement | null;
      ta?.select();
      document.execCommand?.('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function devPay() {
    await api('POST', `/api/dev/fake-pay/${orderId}`, { status: 'paid' });
    await refresh();
  }

  const help = (
    <p className="small" style={{ marginTop: 14 }}>
      <a href={supportHref(cfg?.support_contact ?? '', o?.public_ref)}>Preciso de ajuda</a> · Pedido <strong>{o?.public_ref}</strong>
    </p>
  );

  if (!o) {
    return (
      <div className="wrap">
        {error ? (
          <>
            <div className="status error" role="alert">{error}</div>
            <button className="btn" onClick={() => void refresh()}>Tentar de novo</button>
            <p className="small" style={{ marginTop: 12 }}>Já pagou? <Link to="/acesso">Abra o acesso com seu WhatsApp e o código do pedido</Link>.</p>
          </>
        ) : <div className="spinner dark" aria-label="Carregando" />}
      </div>
    );
  }

  if (o.status === 'paid') {
    return (
      <div className="wrap">
        <div className="status ok" role="status">Pagamento confirmado! Abrindo seu {isDiag(o) ? 'roteiro' : 'mapa'}…</div>
        <Link className="btn" to={destination(o)}>{isDiag(o) ? 'Abrir meu roteiro' : 'Abrir meu mapa'}</Link>
        <p className="small muted" style={{ marginTop: 12 }}>Seu código é <strong>{o.public_ref}</strong>. Com ele e seu WhatsApp, você abre {isDiag(o) ? 'o roteiro' : 'o mapa'} em qualquer aparelho.</p>
      </div>
    );
  }

  if (o.next_action === 'contact_support') {
    return (
      <div className="wrap">
        <div className="status warn" role="status">Seu pedido precisa de uma conferência do suporte antes da liberação.</div>
        <a className="btn" href={supportHref(cfg?.support_contact ?? '', o.public_ref)}>Falar com o suporte</a>
        {help}
      </div>
    );
  }

  if (o.next_action === 'retry') {
    return (
      <div className="wrap">
        <h1>O Pix expirou</h1>
        <p>Nenhum valor foi cobrado. Suas respostas e seu pedido continuam salvos. Gere um novo Pix para concluir.</p>
        {error && <div className="status error" role="alert">{error}</div>}
        <button className="btn" onClick={retry} disabled={checking}>{checking ? 'Gerando…' : 'Gerar novo Pix'}</button>
        <button className="btn link" onClick={check} disabled={checking}>Já paguei: verificar pagamento</button>
        {help}
      </div>
    );
  }

  if (o.next_action === 'redirect' && o.checkout_url) {
    return (
      <div className="wrap">
        <h1>Finalize no checkout</h1>
        <a className="btn" href={o.checkout_url}>Ir para o pagamento</a>
        <button className="btn link" onClick={check}>Verificar pagamento</button>
        {help}
      </div>
    );
  }

  const mins = left !== null ? Math.floor(left / 60000) : null;
  const secs = left !== null ? Math.floor((left % 60000) / 1000) : null;

  return (
    <div className="wrap pay">
      <span className="kicker">Último passo</span>
      <h1 className="pay-title">Falta só o Pix: {brl(o.amount_cents)}</h1>
      <p className="pay-sub">{isDiag(o) ? 'Seu roteiro em PDF é liberado aqui assim que o banco confirmar.' : 'Seu mapa é liberado aqui assim que o banco confirmar.'}</p>

      <button className="btn pay-copy" onClick={copy}>{copied ? 'Código copiado ✓ Agora cole no banco' : '1. Copiar código Pix'}</button>
      <ol className="pay-steps">
        <li><b>2.</b> Abra o app do seu banco e toque em <strong>Pix → Pix Copia e Cola</strong></li>
        <li><b>3.</b> Cole o código e confirme <strong>{brl(o.amount_cents)}</strong></li>
      </ol>
      {mins !== null && (
        <p className="pay-timer">Código válido por <strong>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</strong></p>
      )}
      <ul className="diag-trust">
        <li><CheckIcon size={15} /> Pagamento único</li>
        <li><CheckIcon size={15} /> Garantia de 7 dias</li>
        <li><CheckIcon size={15} /> Liberado na hora</li>
      </ul>

      <div className="status info pay-wait" role="status">
        <span className="spinner dark" aria-hidden="true" /> Aguardando a confirmação do banco…
      </div>

      <details className="card pay-qr">
        <summary><strong>Pagar pelo QR Code</strong> (de outro celular ou computador)</summary>
        {o.pix?.qr_base64 ? (
          <img className="qr" src={`data:image/png;base64,${o.pix.qr_base64}`} alt="QR Code do Pix" />
        ) : (
          <p>Use o código Pix copia e cola abaixo.</p>
        )}
        <textarea id="pix-code" className="code" readOnly value={o.pix?.qr_code ?? ''} aria-label="Código Pix copia e cola" style={{ marginTop: 10 }} />
      </details>

      <div className="order-code">
        <span className="small">Seu código do pedido</span>
        <strong>{o.public_ref}</strong>
        <span className="small">{cfg?.whatsapp_auto
          ? 'Pode fechar esta aba: com o pagamento confirmado, você recebe o acesso no WhatsApp.'
          : 'Se fechar esta aba, abra depois em "Recuperar acesso" com seu WhatsApp e este código.'}</span>
      </div>
      {error && <div className="status warn" role="alert">{error}</div>}
      {!polling && (
        <div className="status info">Ainda não recebemos a confirmação. Se você já pagou, toque em verificar. Você também pode abrir o mapa depois com seu WhatsApp e o código do pedido.</div>
      )}
      <button className="btn secondary" onClick={check} disabled={checking}>{checking ? 'Verificando…' : 'Verificar pagamento'}</button>
      {cfg?.dev_tools && (
        <button className="btn link" onClick={devPay}>[dev] Simular pagamento aprovado</button>
      )}
      {help}
    </div>
  );
}
