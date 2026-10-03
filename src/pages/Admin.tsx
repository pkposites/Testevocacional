import { useEffect, useState } from 'react';
import { formatBrPhone } from '../../shared/phone';
import { api, ApiFailure, brl } from '../api';
import { Dashboard } from './Dashboard';
import { Leads } from './Leads';
import { AdminPush, useAdminManifest } from '../components/AdminPush';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('pt-BR') : '—');

export function Admin() {
  useAdminManifest();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [q, setQ] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [operator, setOperator] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [note, setNote] = useState('');
  const [forceManual, setForceManual] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<'painel' | 'leads' | 'pedidos'>('painel');
  const [share, setShare] = useState<{ link: string; wa: string } | null>(null);

  // Pedidos e alertas só carregam na aba Pedidos (em paralelo).
  async function load() {
    try {
      const [a, o] = await Promise.all([
        api('GET', '/api/admin/alerts'),
        api('GET', `/api/admin/orders?q=${encodeURIComponent(q)}`),
      ]);
      setAlerts(a);
      setOrders(o.orders);
      setAuthed(true);
    } catch (e) {
      if (e instanceof ApiFailure && e.status === 401) setAuthed(false);
      else setMsg((e as Error).message);
    }
  }

  // Checagem leve de login: abre o painel sem esperar pedidos e alertas.
  useEffect(() => {
    api('GET', '/api/admin/me?optional=1')
      .then((r) => setAuthed(!!r.ok))
      .catch((e) => (e instanceof ApiFailure && e.status === 401 ? setAuthed(false) : setMsg((e as Error).message)));
  }, []);
  useEffect(() => {
    if (authed && tab === 'pedidos') void load();
  }, [authed, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function open(id: string, keepShare = false) {
    if (!keepShare) setShare(null);
    setDetail(await api('GET', `/api/admin/orders/${id}`));
    setMsg(null);
  }

  async function act(path: string, body: unknown = {}) {
    setMsg(null);
    try {
      const r = await api('POST', `/api/admin/orders/${detail.order.id}/${path}`, body);
      if (r.wa_url) {
        setShare({ link: r.link, wa: r.wa_url });
        setMsg('Link de acesso gerado (uso único, 7 dias). Envie pelo seu WhatsApp:');
      } else setMsg(`OK: ${JSON.stringify(r.result?.code ?? r.results?.map((x: any) => x?.code) ?? r.ok)}`);
      await open(detail.order.id, true);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (authed === false) {
    return (
      <div className="wrap">
        <h1>Admin</h1>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          try { await api('POST', '/api/admin/login', { password: pw }); setMsg(null); setAuthed(true); } catch (err) { setMsg((err as Error).message); }
        }}>
          <label htmlFor="pw">Senha</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {msg && <div className="status error">{msg}</div>}
          <button className="btn">Entrar</button>
        </form>
      </div>
    );
  }
  if (!authed) return <div className="wrap"><div className="spinner dark" /></div>;

  return (
    <div className="wrap admin-wrap">
      <h1>Admin</h1>
      <div className="admin-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'painel'} onClick={() => setTab('painel')}>Painel</button>
        <button role="tab" aria-selected={tab === 'leads'} onClick={() => setTab('leads')}>Leads</button>
        <button role="tab" aria-selected={tab === 'pedidos'} onClick={() => setTab('pedidos')}>Pedidos</button>
      </div>
      {tab === 'painel' && <AdminPush />}
      {tab === 'painel' ? <Dashboard /> : tab === 'leads' ? <Leads /> : <>
      {msg && <div className="status info">{msg}</div>}
      {share && (
        <div className="card soft">
          <p className="small" style={{ wordBreak: 'break-all' }}>{share.link}</p>
          <div className="row">
            <a className="btn" href={share.wa} target="_blank" rel="noreferrer">Abrir no WhatsApp</a>
            <button className="btn secondary" onClick={() => navigator.clipboard.writeText(share.link)}>Copiar link</button>
          </div>
        </div>
      )}
      {alerts && (alerts.flagged_payments.length + alerts.pending_messages.length + alerts.webhook_issues.length > 0) && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h3>Alertas</h3>
          {alerts.flagged_payments.map((p: any) => (
            <p key={p.id} className="small">Pagamento <code>{p.provider_resource_id}</code> · {p.normalized_status} · <strong>{p.flag}</strong> · {p.verified_amount_cents != null ? brl(p.verified_amount_cents) : '—'} {p.order_id && <button className="btn link" onClick={() => open(p.order_id)}>abrir pedido</button>}</p>
          ))}
          {alerts.pending_messages.map((e: any) => (
            <p key={e.id} className="small">WhatsApp {e.kind} {e.status} ({e.attempts}x) · {e.public_ref} · {e.last_error} {e.order_id && <button className="btn link" onClick={() => open(e.order_id)}>abrir</button>}</p>
          ))}
          {alerts.webhook_issues.map((w: any) => (
            <p key={w.event_key} className="small">Webhook {w.provider} · {w.resource_id ?? '—'} · assinatura {w.signature_valid ? 'ok' : 'INVÁLIDA'} · {w.result_code ?? 'não processado'} · {dt(w.received_at)}</p>
          ))}
        </div>
      )}
      <form className="row" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input type="text" placeholder="WhatsApp, código MC-, ID do pedido ou do pagamento" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" style={{ flex: '0 0 120px' }}>Buscar</button>
      </form>
      <table className="admin" style={{ marginTop: 12 }}>
        <thead><tr><th>Pedido</th><th>WhatsApp</th><th>Status</th><th>Criado</th><th>Pago</th></tr></thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} onClick={() => open(o.id)} style={{ cursor: 'pointer' }}>
              <td>{o.public_ref}</td><td>{formatBrPhone(o.buyer_phone)}</td><td>{o.status}</td><td>{dt(o.created_at)}</td><td>{dt(o.paid_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detail && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>{detail.order.public_ref} · {detail.order.status}</h2>
          <p className="small">{detail.order.buyer_name} · {formatBrPhone(detail.order.buyer_phone)} · {brl(detail.order.amount_cents)} · {detail.order.provider} · UTM: {JSON.stringify(detail.order.utm)}</p>
          <h3>Pagamentos</h3>
          <table className="admin"><tbody>
            {detail.payments.map((p: any) => (
              <tr key={p.id}><td><code>{p.provider_resource_id}</code></td><td>{p.normalized_status} ({p.raw_status})</td><td>{p.verified_amount_cents != null ? brl(p.verified_amount_cents) : '—'}</td><td>{p.flag ?? ''}</td><td>{dt(p.created_at)}</td></tr>
            ))}
          </tbody></table>
          <p className="small">Acesso: {detail.entitlement ? `${detail.entitlement.state} · 1º acesso ${dt(detail.entitlement.first_access_at)}` : 'não liberado'}</p>
          <h3>Mensagens de acesso {detail.whatsapp_auto ? '(WhatsApp automático)' : '(envio manual)'}</h3>
          {detail.messages.map((e: any) => <p key={e.id} className="small">{e.kind} · {e.status} · {e.attempts}x · {dt(e.sent_at)} {e.last_error ?? ''}</p>)}
          <h3>Auditoria</h3>
          {detail.audit.map((a: any, i: number) => <p key={i} className="small">{dt(a.created_at)} · {a.operator} · {a.action} · {a.payment_ref ?? ''} · {a.note ?? ''}</p>)}

          <div className="stack" style={{ marginTop: 12 }}>
            <div className="row">
              <button className="btn secondary" onClick={() => act('reconcile')}>Consultar provedor</button>
              <button className="btn secondary" onClick={() => act('resend', { operator })} disabled={!detail.entitlement || detail.entitlement.state !== 'active'}>{detail.whatsapp_auto ? 'Reenviar acesso no WhatsApp' : 'Gerar link e enviar pelo meu WhatsApp'}</button>
            </div>
            <label htmlFor="op">Operador</label>
            <input id="op" type="text" value={operator} onChange={(e) => setOperator(e.target.value)} />
            <label htmlFor="pref">ID do pagamento conferido no provedor</label>
            <input id="pref" type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
            <label htmlFor="note">Observação</label>
            <input id="note" type="text" value={note} onChange={(e) => setNote(e.target.value)} />
            <label className="check"><input type="checkbox" checked={forceManual} onChange={(e) => setForceManual(e.target.checked)} /> Conferência manual (pagamento verificado no painel do provedor, fora da API)</label>
            <div className="row">
              <button className="btn" disabled={!operator || !paymentRef} onClick={() => act('manual-release', { operator, payment_ref: paymentRef, note, force_manual: forceManual })}>Liberar compra verificada</button>
              <button className="btn secondary" disabled={!operator} onClick={() => { if (confirm('Revogar o acesso deste pedido?')) void act('revoke', { operator, note }); }}>Revogar (reembolso)</button>
            </div>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
