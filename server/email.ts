// E-mail transacional. Resend via HTTP em produção; "log" apenas registra (dev/testes).
import type { AppConfig } from './config';

export type EmailMessage = { to: string; subject: string; html: string; text: string };
export type EmailSender = (msg: EmailMessage) => Promise<void>;

export const sentEmails: EmailMessage[] = []; // inspeção em dev/testes

export function createEmailSender(cfg: AppConfig, fetchImpl: typeof fetch = fetch): EmailSender {
  if (cfg.email.provider === 'resend') {
    return async (msg) => {
      if (!cfg.email.resendApiKey) throw new Error('RESEND_API_KEY não configurado');
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.email.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.email.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    };
  }
  if (cfg.env === 'production') throw new Error('Configure EMAIL_PROVIDER=resend e RESEND_API_KEY em produção');
  return async (msg) => {
    sentEmails.push(msg);
    if (cfg.env !== 'test') console.log(`[email:log] para=${msg.to.replace(/(.).+@/, '$1***@')} assunto="${msg.subject}"\n${msg.text}`);
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function accessEmail(opts: { name?: string; link: string; kind: 'purchase' | 'recover'; support: string; ttlText: string }): Omit<EmailMessage, 'to'> {
  const hello = opts.name ? `Olá, ${opts.name}!` : 'Olá!';
  const intro =
    opts.kind === 'purchase'
      ? 'Seu pagamento foi confirmado. Seu Mapa da Carreira está pronto.'
      : 'Recebemos um pedido para acessar seu Mapa da Carreira.';
  const subject = opts.kind === 'purchase' ? 'Seu Mapa da Carreira está liberado' : 'Seu link de acesso ao Mapa da Carreira';
  const text = `${hello}\n\n${intro}\n\nAcesse pelo link (válido por ${opts.ttlText}, uso único):\n${opts.link}\n\nSe o link expirar, peça outro na página "Recuperar acesso".\nDúvidas: ${opts.support}\n`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#13294b">
<p>${esc(hello)}</p><p>${esc(intro)}</p>
<p><a href="${esc(opts.link)}" style="display:inline-block;background:#c2410c;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Abrir meu mapa</a></p>
<p style="font-size:14px;color:#475569">Link válido por ${esc(opts.ttlText)}, de uso único. Se expirar, peça outro na página “Recuperar acesso”.</p>
<p style="font-size:14px;color:#475569">Dúvidas: ${esc(opts.support)}</p></div>`;
  return { subject, html, text };
}
