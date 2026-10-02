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
        <h3>Paguei e não recebi o acesso</h3>
        <p className="small">A confirmação do Pix costuma levar segundos, mas pode demorar alguns minutos. Use <Link to="/acesso">Recuperar acesso</Link> com o WhatsApp e o código do pedido (MC-…), que aparece na tela do Pix.</p>
        <h3>Perdi o código do pedido</h3>
        <p className="small">Fale com o suporte pelo mesmo WhatsApp da compra. Conferimos o pagamento e enviamos um novo link de acesso.</p>
        <h3>O Pix expirou</h3>
        <p className="small">Nenhum valor foi cobrado. Volte à sua prévia e gere um novo Pix. Suas respostas ficam salvas.</p>
        <h3>Quero falar com alguém</h3>
        <p className="small">Informe o código do pedido (começa com MC-) para agilizar o atendimento.</p>
        {cfg && <a className="btn" href={supportHref(cfg.support_contact, ref)}>Falar com o suporte</a>}
        {cfg && <p className="small muted" style={{ marginTop: 8 }}>Contato: {cfg.support_contact}</p>}
      </div>
    </div>
  );
}
