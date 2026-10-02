import { normalizeBrPhone } from '../shared/phone';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type Ctx = {
  req: Request;
  url: URL;
  requestId: string;
  cookies: Record<string, string>;
  setCookies: string[];
  params: Record<string, string>;
};

export function json(ctx: Ctx, status: number, body: unknown): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': ctx.requestId,
  });
  for (const c of ctx.setCookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(ctx: Ctx, err: unknown): Response {
  if (err instanceof ApiError) {
    return json(ctx, err.status, { code: err.code, message: err.message, request_id: ctx.requestId });
  }
  // Nunca vazar detalhes internos ou segredos para o cliente.
  console.error(`[${ctx.requestId}]`, err instanceof Error ? err.stack ?? err.message : err);
  return json(ctx, 500, { code: 'internal_error', message: 'Erro interno. Tente novamente.', request_id: ctx.requestId });
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function cookie(name: string, value: string, opts: { maxAgeSec: number; secure: boolean; path?: string }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path ?? '/'}`, `Max-Age=${opts.maxAgeSec}`, 'HttpOnly', 'SameSite=Lax'];
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hmacHex(alg: 'sha256' | 'sha1', secret: string, data: string): string {
  return createHmac(alg, secret).update(data).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function requestId(): string {
  return randomUUID();
}

export async function readJson(ctx: Ctx, maxBytes = 16_384): Promise<any> {
  const text = await ctx.req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'payload_too_large', 'Requisição muito grande.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json', 'JSON inválido.');
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('x-nf-client-connection-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

export function normalizePhone(v: unknown): string {
  const p = normalizeBrPhone(typeof v === 'string' ? v : '');
  if (!p) throw new ApiError(400, 'invalid_phone', 'Informe um WhatsApp válido com DDD, por exemplo (11) 98765-4321.');
  return p;
}
