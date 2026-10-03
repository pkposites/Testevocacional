import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getMySession } from '../api';

export function MyMaps() {
  const nav = useNavigate();
  const [maps, setMaps] = useState<{ result_id: string; public_ref: string; paid_at: string }[] | null>(null);
  useEffect(() => {
    const noAccess = async () => {
      // Sem sessão de acesso: talvez a compra/cadastro tenha sido feita neste navegador.
      const s = await getMySession().catch(() => null);
      if (s?.purchased_result_id) nav(`/mapa/${s.purchased_result_id}`, { replace: true });
      else if (s?.result) nav('/previa', { replace: true }); // terminou o teste mas ainda não liberou o mapa
      else if (s && s.progress > 0) nav('/teste', { replace: true }); // teste pela metade neste aparelho
      else nav('/acesso', { replace: true });
    };
    api('GET', '/api/access/me?optional=1')
      .then((r) => (r.maps ? setMaps(r.maps) : noAccess()))
      .catch(noAccess);
  }, [nav]);
  if (!maps) return <div className="wrap"><div className="spinner dark" aria-label="Carregando" /></div>;
  return (
    <div className="wrap">
      <h1>Meus mapas</h1>
      {maps.length === 0 && <p>Nenhum mapa liberado para este WhatsApp.</p>}
      {maps.map((m) => (
        <Link key={m.result_id} to={`/mapa/${m.result_id}`} className="card" style={{ display: 'block', textDecoration: 'none' }}>
          <strong>Pedido {m.public_ref}</strong>
          <div className="small muted">Liberado em {new Date(m.paid_at).toLocaleDateString('pt-BR')}</div>
        </Link>
      ))}
      <button className="btn link" onClick={async () => { await api('POST', '/api/access/logout'); nav('/'); }}>Sair deste aparelho</button>
    </div>
  );
}
