export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure(0, 'network', 'Sem conexão. Verifique sua internet e tente de novo.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(res.status, data.code ?? 'error', data.message ?? 'Algo deu errado. Tente novamente.', data.request_id);
  return data as T;
}

export type PublicConfig = {
  price_cents: number;
  currency: string;
  provider: string;
  delivery_mode: 'automatic' | 'manual';
  manual_delivery_sla: string | null;
  support_contact: string;
  seller: { name: string; document: string; address: string };
  meta_pixel_id: string | null;
  quiz_version: string;
  dev_tools: boolean;
  whatsapp_auto: boolean;
};

let configPromise: Promise<PublicConfig> | undefined;
export const getConfig = () => (configPromise ??= api<PublicConfig>('GET', '/api/config').catch((e) => {
  configPromise = undefined;
  throw e;
}));

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function supportHref(contact: string, ref?: string) {
  const msg = `Olá! Preciso de ajuda com o Mapa da Carreira.${ref ? ` Pedido ${ref}.` : ''}`;
  if (contact.includes('@')) return `mailto:${contact}?subject=${encodeURIComponent(`Ajuda${ref ? ` - pedido ${ref}` : ''}`)}&body=${encodeURIComponent(msg)}`;
  const digits = contact.replace(/\D/g, '');
  if (digits.length >= 10) return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
  return contact;
}

export const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navegação privada */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignora */
    }
  },
};
