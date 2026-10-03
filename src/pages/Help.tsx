import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getConfig, supportHref, type PublicConfig } from '../api';

export function Help() {
  const [params] = useSearchParams();
  const ref = params.get('pedido') ?? undefined;
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => void getConfig().then(setCfg).catch(() => undefined), []);
  return (
    <div className="wrap">
      <h1>Ajuda</h1>
      <div className="card">
        <h3>{cfg?.offer_mode === 'free' ? 'Não consigo abrir meu mapa' : 'Paguei e não recebi o acesso'}</h3>
        <p className="small">{cfg?.offer_mode === 'free' ? '' : 'A confirmação do Pix costuma levar segundos, mas pode demorar alguns minutos. '}No mesmo celular ou computador em que fez o teste, toque em “Já fiz o teste”: o mapa abre direto. Em outro aparelho, use <Link to="/acesso">Recuperar acesso</Link> com o WhatsApp que você informou e o código do mapa (MC-…, no topo do mapa) ou do roteiro (DG-…, na tela do Pix).</p>
        <h3>Perdi o código</h3>
        <p className="small">Fale com o suporte informando o WhatsApp que você usou. Conferimos e enviamos um novo acesso.</p>
        {cfg?.offer_mode !== 'free' && (
          <>
            <h3>O Pix expirou</h3>
            <p className="small">Nenhum valor foi cobrado. Volte à sua prévia e gere um novo Pix. Suas respostas ficam salvas.</p>
          </>
        )}
        <h3>Quero falar com alguém</h3>
        <p className="small">Se tiver, informe o código do mapa ou do pedido (MC-… ou DG-…) para agilizar o atendimento.</p>
        {cfg && <a className="btn" href={supportHref(cfg.support_contact, ref)}>Falar com o suporte</a>}
        {cfg && <p className="small muted" style={{ marginTop: 8 }}>Contato: {cfg.support_contact}</p>}
      </div>
    </div>
  );
}
