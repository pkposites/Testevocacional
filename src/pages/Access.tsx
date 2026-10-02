import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export function Access() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('t');
  const [state, setState] = useState<'form' | 'exchanging' | 'sent' | 'error'>(token ? 'exchanging' : 'form');
  const [msg, setMsg] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    api('POST', '/api/access/exchange', { token })
      .then((r) => {
        history.replaceState(null, '', '/acesso'); // remove o token da barra de endereço
        if (r.maps.length === 1) nav(`/mapa/${r.maps[0].result_id}`, { replace: true });
        else nav('/meus-mapas', { replace: true });
      })
      .catch((e) => {
        setMsg((e as Error).message);
        setState('error');
      });
  }, [token, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('POST', '/api/access/recover', { email });
      setMsg(r.message);
      setState('sent');
    } catch (err) {
      setMsg((err as Error).message);
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
          <p className="small muted">O link vale por 30 minutos e funciona uma vez. Confira também a caixa de spam ou promoções.</p>
          <button className="btn secondary" onClick={() => setState('form')}>Enviar de novo</button>
        </>
      ) : (
        <form className="stack" onSubmit={submit}>
          <p>Informe o e-mail usado na compra. Se houver um mapa liberado, enviamos um link de acesso.</p>
          <div>
            <label htmlFor="rec-email">E-mail</label>
            <input id="rec-email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {state === 'form' && msg && <div className="status error" role="alert">{msg}</div>}
          <button className="btn" disabled={busy || !email.includes('@')}>{busy ? 'Enviando…' : 'Enviar link de acesso'}</button>
        </form>
      )}
      <p className="small" style={{ marginTop: 16 }}><Link to="/ajuda">Não recebi o e-mail</Link></p>
    </div>
  );
}
