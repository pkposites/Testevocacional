// Mensagens de acesso pelo WhatsApp.
// - cloud: API oficial do WhatsApp (Meta Cloud API), com template aprovado de 2 variáveis: {{1}} nome, {{2}} link.
// - none: nada é enviado automaticamente; o acesso abre na aba da compra, a recuperação usa WhatsApp + código
//   do pedido e o admin envia o link pelo próprio WhatsApp.
// - log: só registra (dev/testes).
import type { AppConfig } from './config';
import { maskForDisplay } from '../shared/phone';

export type AccessMessage = { to: string; name: string; link: string; kind: 'purchase' | 'recover' | 'free' | 'diagnostic' };
export type MessageSender = { enabled: boolean; send(msg: AccessMessage): Promise<void> };

export const sentMessages: AccessMessage[] = []; // inspeção em dev/testes

export function accessText(m: Omit<AccessMessage, 'to'>, support: string): string {
  const intro =
    m.kind === 'purchase' ? 'seu pagamento foi confirmado e seu Mapa da Carreira está pronto.'
      : m.kind === 'diagnostic' ? 'seu pagamento foi confirmado e seu Roteiro para começar está pronto.'
      : m.kind === 'free' ? 'seu Mapa da Carreira está pronto. Guarde este link para abrir quando quiser.'
        : 'aqui está seu link de acesso ao Mapa da Carreira.';
  return `Olá, ${m.name}! ${intro}\n\nAbra pelo link (uso único):\n${m.link}\n\nDúvidas: ${support}`;
}

export function createMessageSender(cfg: AppConfig, fetchImpl: typeof fetch = fetch): MessageSender {
  const w = cfg.whatsapp;
  if (w.provider === 'cloud') {
    return {
      enabled: true,
      async send(m) {
        if (!w.token || !w.phoneNumberId || !w.templateName) throw new Error('WhatsApp Cloud API não configurada');
        const res = await fetchImpl(`https://graph.facebook.com/v21.0/${w.phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${w.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: m.to,
            type: 'template',
            template: {
              name: w.templateName,
              language: { code: w.templateLang },
              components: [{ type: 'body', parameters: [{ type: 'text', text: m.name }, { type: 'text', text: m.link }] }],
            },
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${(await res.text()).slice(0, 200)}`);
      },
    };
  }
  if (w.provider === 'log') {
    return {
      enabled: true,
      async send(m) {
        sentMessages.push(m);
        if (cfg.env !== 'test') console.log(`[whatsapp:log] para=${maskForDisplay(m.to)} tipo=${m.kind}\n${accessText(m, cfg.supportContact)}`);
      },
    };
  }
  return {
    enabled: false,
    async send() {
      throw new Error('Envio automático de WhatsApp desativado (WHATSAPP_PROVIDER=none). Envie o link pelo admin.');
    },
  };
}
