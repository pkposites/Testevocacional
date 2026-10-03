import { describe, expect, it } from 'vitest';
import { formatBrPhone, maskBrPhone, normalizeBrPhone } from '../shared/phone';
import { loadConfig } from '../server/config';
import { mpPayer } from '../server/payments/mercadopago';

describe('WhatsApp brasileiro', () => {
  it('normaliza formatos comuns', () => {
    for (const v of ['(11) 98765-4321', '11987654321', '+55 11 98765-4321', '5511987654321', '011 98765 4321', '0055 11 987654321']) {
      expect(normalizeBrPhone(v)).toBe('5511987654321');
    }
  });
  it('rejeita fixo, DDD inválido e tamanho errado', () => {
    for (const v of ['(11) 3333-4444', '(10) 98765-4321', '1198765432', '119876543210', '', 'abc']) expect(normalizeBrPhone(v)).toBeNull();
  });
  it('máscara e formatação', () => {
    expect(maskBrPhone('11987654321')).toBe('(11) 98765-4321');
    expect(maskBrPhone('119')).toBe('(11) 9');
    expect(formatBrPhone('5511987654321')).toBe('(11) 98765-4321');
  });
  it('pagador do Mercado Pago: e-mail técnico no domínio do site, ou do template', () => {
    const input = { orderId: 'x', publicRef: 'MC-ABC234', attempt: 1, amountCents: 1450, buyerPhone: '5511987654321', buyerName: 'Ana', description: 'd', attribution: {} };
    expect(mpPayer(loadConfig({ APP_ENV: 'test' }), input)).toEqual({ first_name: 'Ana', phone: { area_code: '11', number: '987654321' }, email: 'pix+mc-abc234@localhost' });
    expect(mpPayer(loadConfig({ APP_ENV: 'test', MP_PAYER_EMAIL_TEMPLATE: 'pix+{ref}@loja.com.br' }), input).email).toBe('pix+mc-abc234@loja.com.br');
  });
});
