// Ativa notificações do painel neste aparelho (precisa do painel instalado na tela de início no iPhone).
import { useEffect, useState } from 'react';
import { api } from '../api';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

function urlB64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Coloca o manifesto do painel na página: "Adicionar à Tela de Início" instala o app do admin. */
export function useAdminManifest() {
  useEffect(() => {
    if (document.querySelector('link[rel="manifest"]')) return;
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = '/admin.webmanifest';
    document.head.appendChild(l);
    const t = document.createElement('meta');
    t.name = 'apple-mobile-web-app-title';
    t.content = 'Mapa Admin';
    document.head.appendChild(t);
    const c = document.createElement('meta');
    c.name = 'apple-mobile-web-app-capable';
    c.content = 'yes';
    document.head.appendChild(c);
  }, []);
}

export function AdminPush() {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [state, setState] = useState<'idle' | 'on' | 'busy' | 'off-server'>('idle');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      const k = await api('GET', '/api/admin/push/key').catch(() => null);
      if (!k?.enabled) return setState('off-server');
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') setState('on');
    })();
  }, [supported]);

  async function enable() {
    setState('busy');
    setMsg(null);
    try {
      const k = await api('GET', '/api/admin/push/key');
      if (!k.enabled) { setState('off-server'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações nos Ajustes do iPhone → Notificações → Mapa Admin.');
      const reg = await navigator.serviceWorker.register('/admin-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(k.public_key) }));
      await api('POST', '/api/admin/push/subscribe', { subscription: sub.toJSON() });
      await api('POST', '/api/admin/push/test');
      setState('on');
      setMsg('Pronto! Enviamos uma notificação de teste.');
    } catch (e) {
      setState('idle');
      setMsg((e as Error).message);
    }
  }

  async function test() {
    const r = await api('POST', '/api/admin/push/test').catch((e) => ({ error: (e as Error).message }));
    setMsg(r.error ?? (r.sent ? 'Notificação de teste enviada.' : 'Nenhum aparelho inscrito. Ative de novo.'));
  }

  return (
    <div className="card soft admin-push">
      <strong>🔔 Aviso a cada novo lead e venda</strong>
      {state === 'off-server' ? (
        <p className="small muted" style={{ margin: '6px 0 0' }}>As notificações ainda não estão configuradas no servidor (faltam as chaves VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no Netlify, com um novo deploy).</p>
      ) : isIos() && !isStandalone() ? (
        <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>Toque em <strong>Compartilhar</strong> (quadrado com seta) e depois em <strong>Adicionar à Tela de Início</strong>.</li>
          <li>Abra o <strong>Mapa Admin</strong> pelo ícone novo na tela de início e entre com a senha.</li>
          <li>Volte aqui e toque em <strong>Ativar notificações</strong>.</li>
        </ol>
      ) : !supported ? (
        <p className="small muted" style={{ margin: '6px 0 0' }}>Este navegador não aceita notificações. No iPhone, use o painel instalado na tela de início (iOS 16.4 ou mais novo).</p>
      ) : state === 'on' ? (
        <div style={{ marginTop: 6 }}>
          <span className="small" style={{ color: 'var(--ok)', fontWeight: 700 }}>Ativadas neste aparelho.</span>{' '}
          <button type="button" className="btn link" style={{ width: 'auto', display: 'inline', padding: 0, minHeight: 0 }} onClick={test}>Enviar teste</button>
        </div>
      ) : (
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={enable} disabled={state === 'busy'}>
          {state === 'busy' ? 'Ativando…' : 'Ativar notificações'}
        </button>
      )}
      {msg && <p className="small" style={{ margin: '8px 0 0' }}>{msg}</p>}
    </div>
  );
}
