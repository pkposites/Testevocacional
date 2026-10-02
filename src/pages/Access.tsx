import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { maskBrPhone, normalizeBrPhone } from '../../shared/phone';
import { api, getConfig, type PublicConfig } from '../api';

export function Access() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('t');
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<'form' | 'exchanging' | 'sent' | 'error'>(token ? 'exchanging' : 'form');
  const [msg, setMsg] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const once = useRef(false);

  useEffect(() => void getConfig().then(setCfg).catch(() => undefined), []);

  const openMaps = (maps: { result_id: string }[]) => {
    if (maps.length === 1) nav(`/mapa/${maps[0].result_id}`, { replace: true });
    else nav('/meus-mapas', { replace: true });
  };

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    api('POST', '/api/access/exchange', { token })
      .then((r) => {
        history.replaceState(null, '', '/acesso'); // remove o token da barra de endereço
        openMaps(r.maps);
      })
      .catch((e) => {
        setMsg((e as Error).message);
        setState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const codeOptional = !!cfg?.whatsapp_auto;
  const valid = !!normalizeBrPhone(phone) && (codeOptional || code.replace(/[^a-z0-9]/gi, '').length >= 6);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const r = await api('POST', '/api/access/recover', { phone, order_ref: code });
      if (r.maps) return openMaps(r.maps);
      setMsg(r.message);
      setState('sent');
    } catch (err) {
      setMsg((err as Error).message);
      setState('form');
    }
    setBusy(false);
  }

  if (state === 'exchanging') return <div className="wrap"><div className="spinner dark" aria-label="Abrindo" /> <p>Abrindo seu mapa…</p></div>;

  return (
    <div className="wrap">
      <h1>Recuperar acesso</h1>
      {state === 'error' && <div className="status warn" role="alert">{msg}</div>}
      {state === 'sent' ? (
        <>
          <div className="status ok" role="status">{msg}</div>
          <p className="small muted">O link vale por 30 minutos e funciona uma vez.</p>
          <button className="btn secondary" onClick={() => setState('form')}>Tentar de novo</button>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p>Informe o WhatsApp usado na compra e o código do pedido, que aparece na tela do Pix (começa com MC-).</p>
          <div>
            <label htmlFor="rec-phone">WhatsApp com DDD</label>
            <input id="rec-phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(11) 98765-4321" required
              value={phone} onChange={(e) => setPhone(maskBrPhone(e.target.value))} />
          </div>
          <div>
            <label htmlFor="rec-code">Código do pedido {codeOptional && <span className="muted">(opcional)</span>}</label>
            <input id="rec-code" type="text" autoCapitalize="characters" placeholder="MC-XXXXXX" maxLength={10}
              value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            {codeOptional && <p className="small muted" style={{ marginTop: 6 }}>Sem o código, enviamos um link para o seu WhatsApp.</p>}
          </div>
          {state === 'form' && msg && <div className="status error" role="alert">{msg}</div>}
          <button className="btn" disabled={busy || !valid}>{busy ? 'Verificando…' : code ? 'Abrir meu mapa' : 'Enviar link no WhatsApp'}</button>
        </form>
      )}
      <p className="small" style={{ marginTop: 16 }}><Link to="/ajuda">Perdi o código do pedido</Link></p>
    </div>
  );
}
