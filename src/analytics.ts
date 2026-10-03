// Medição: só carrega o Pixel após consentimento. Nunca envia respostas, nome, telefone ou profissão.
import { META_STANDARD_EVENTS } from '../shared/events';
import { api, getConfig, storage } from './api';

type Consent = 'granted' | 'denied' | 'unknown';
const CONSENT_KEY = 'mc_consent';
const ATTR_KEY = 'mc_attr';

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

export function getConsent(): Consent {
  const v = storage.get(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : 'unknown';
}

export async function setConsent(v: 'granted' | 'denied') {
  storage.set(CONSENT_KEY, v);
  if (v === 'granted') await loadPixel();
}

let pixelLoaded = false;
async function loadPixel() {
  if (pixelLoaded || getConsent() !== 'granted') return;
  const cfg = await getConfig().catch(() => null);
  if (!cfg?.meta_pixel_id) return;
  if (cfg.internal) return; // aparelho do admin: não alimenta o Pixel da Meta
  pixelLoaded = true;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e); t.async = true; t.src = v;
    const s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', cfg.meta_pixel_id);
  window.fbq('track', 'PageView');
}

export function initAnalytics() {
  captureAttribution();
  void loadPixel();
}

/** Guarda UTMs da chegada (somente na primeira visita da sessão). */
function captureAttribution() {
  const p = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  const found: Record<string, string> = {};
  for (const k of keys) {
    const v = p.get(k);
    if (v) found[k] = v;
  }
  if (Object.keys(found).length || !storage.get(ATTR_KEY)) {
    storage.set(ATTR_KEY, JSON.stringify({ ...found, landing_path: location.pathname, referrer: document.referrer.slice(0, 200) }));
  }
}

export function getAttribution(): Record<string, string> {
  try {
    return JSON.parse(storage.get(ATTR_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function metaCookies() {
  const c = Object.fromEntries(document.cookie.split(';').map((x) => x.trim().split('=')));
  return { fbp: c._fbp as string | undefined, fbc: c._fbc as string | undefined };
}

const sent = new Set<string>();

/** Evento no Pixel (se consentido) + registro no nosso servidor para eventos de navegador. */
export function track(name: string, opts: { eventId?: string; value?: number; serverLog?: boolean } = {}) {
  const eventId = opts.eventId ?? `${name}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const onceKey = `mc_ev_${eventId}`;
  if (sent.has(eventId) || (opts.eventId && storage.get(onceKey))) return;
  sent.add(eventId);
  if (opts.eventId) storage.set(onceKey, '1');
  if (getConsent() === 'granted' && window.fbq) {
    const data = opts.value !== undefined ? { value: opts.value, currency: 'BRL' } : {};
    window.fbq(META_STANDARD_EVENTS.has(name) ? 'track' : 'trackCustom', name, data, { eventID: eventId });
  }
  if (opts.serverLog) {
    void api('POST', '/api/events', { name, event_id: eventId, consent: getConsent(), attribution: getAttribution() }).catch(() => undefined);
  }
}
