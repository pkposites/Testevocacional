import { CATALOG_SIZE } from '../../shared/quiz';
import { useEffect, useState } from 'react';
import { brl, getConfig, type PublicConfig } from '../api';

// Modelo de texto: revisar com assessoria jurídica antes do lançamento.
export function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  useEffect(() => void getConfig().then(setCfg).catch(() => undefined), []);
  const seller = cfg ? `${cfg.seller.name} (${cfg.seller.document})${cfg.seller.address ? `, ${cfg.seller.address}` : ''}` : '';
  if (kind === 'privacy') {
    return (
      <div className="wrap">
        <h1>Política de privacidade</h1>
        <p>Responsável pelos dados: {seller}. Contato: {cfg?.support_contact}.</p>
        <h3>O que coletamos</h3>
        <p>Respostas do teste (de forma anônima até a compra), momento de carreira, tempo disponível e, opcionalmente, sua área atual. Para liberar o mapa: primeiro nome e WhatsApp, e se você autoriza mostrar seu primeiro nome nas notificações do site. Não coletamos CPF, data de nascimento ou dados sensíveis no teste. Dados de pagamento são tratados pelo provedor de pagamento.</p>
        <h3>Para que usamos</h3>
        <p>Gerar seu resultado, processar o pedido, liberar e permitir a recuperação do acesso pelo WhatsApp, prestar suporte e medir de forma agregada o desempenho das páginas. Mensagens promocionais só com seu aceite separado e opcional.</p>
        <h3>Medição e cookies</h3>
        <p>Usamos cookies essenciais para manter sua sessão. Cookies de medição de anúncios (Meta Pixel) só são ativados se você aceitar. Nunca enviamos suas respostas, nome, telefone ou profissão para plataformas de anúncios.</p>
        <h3>Seus direitos</h3>
        <p>Você pode pedir acesso, correção ou exclusão dos seus dados pelo contato acima.</p>
      </div>
    );
  }
  if (cfg?.offer_mode === 'free') {
    return (
      <div className="wrap">
        <h1>Termos de uso</h1>
        <p>Responsável: {seller}. Contato: {cfg.support_contact}.</p>
        <h3>O que é</h3>
        <p>Mapa da Carreira: teste gratuito de preferências que gera uma página privada com cinco caminhos sugeridos, explicações, pontos de atenção, primeiro passo e um plano prático de sete dias. Não há cobrança.</p>
        <h3>Natureza do resultado</h3>
        <p>Ferramenta de exploração baseada em preferências declaradas. Não é avaliação psicológica, teste de aptidão nem garantia de carreira, emprego ou renda. O catálogo contém {CATALOG_SIZE} caminhos e não cobre todas as profissões.</p>
        <h3>Seus dados</h3>
        <p>Pedimos primeiro nome e WhatsApp para liberar e guardar o seu mapa e falar com você sobre o resultado. Se você autorizar receber novidades, poderemos te chamar no WhatsApp. Seu primeiro nome só aparece nas notificações do site se você autorizar. Você pode pedir a exclusão a qualquer momento pelo contato acima.</p>
      </div>
    );
  }
  return (
    <div className="wrap">
      <h1>Condições de venda</h1>
      <p>Vendedor: {seller}. Contato: {cfg?.support_contact}.</p>
      <h3>Produto</h3>
      <p>Mapa da Carreira: página privada com cinco caminhos sugeridos a partir das suas respostas, explicações, pontos de atenção, primeiro passo e um plano prático de sete dias. Preço: {brl(cfg?.price_cents ?? 1450)}, pagamento único via Pix, sem assinatura.</p>
      <h3>Natureza do resultado</h3>
      <p>Ferramenta de exploração baseada em preferências declaradas. Não é avaliação psicológica, teste de aptidão nem garantia de carreira, emprego ou renda. O catálogo contém {CATALOG_SIZE} caminhos e não cobre todas as profissões.</p>
      <h3>Entrega</h3>
      <p>{cfg?.delivery_mode === 'manual'
        ? `A liberação é conferida manualmente em ${cfg.manual_delivery_sla} após a confirmação do Pix. O link chega no WhatsApp informado.`
        : 'O acesso é liberado após a confirmação do Pix pelo provedor de pagamento e fica disponível com o WhatsApp informado e o código do pedido.'}
        {' '}A compra cobre o mapa associado ao pedido. Um novo teste gera outro resultado.</p>
      <h3>Arrependimento e reembolso</h3>
      <p>Você pode pedir reembolso em até 7 dias após a compra pelo contato acima. Com o reembolso confirmado, o acesso ao mapa é encerrado.</p>
    </div>
  );
}
