import { useEffect, useRef, useState } from 'react';
import { storage } from '../api';

// Notificações no topo com dados REAIS do app (/api/social-proof). Nada é inventado:
// sem atividade recente, nada aparece. Primeiro nome só de quem autorizou; os demais aparecem como "Uma pessoa".

type Item = { name: string | null; career: string; minutes_ago: number };

const SHOW_MS = 5500;
const GAP_MS = 9000;
const MAX_PER_VISIT = 4;

function ago(min: number) {
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

export function SocialProof() {
  const [items, setItems] = useState<Item[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(storage.get('mc_proof_off') === '1');
  const idx = useRef(0);
  const shown = useRef(0);

  useEffect(() => {
    if (closed) return;
    fetch('/api/social-proof', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.items?.length && setItems(d.items))
      .catch(() => undefined);
  }, [closed]);

  useEffect(() => {
    if (closed || !items.length) return;
    let t: number;
    const cycle = () => {
      if (shown.current >= Math.min(MAX_PER_VISIT, items.length)) return;
      setCurrent(items[idx.current % items.length]);
      idx.current += 1;
      shown.current += 1;
      setVisible(true);
      t = window.setTimeout(() => {
        setVisible(false);
        t = window.setTimeout(cycle, GAP_MS);
      }, SHOW_MS);
    };
    t = window.setTimeout(cycle, 3500);
    return () => window.clearTimeout(t);
  }, [items, closed]);

  if (closed || !current) return null;
  return (
    <div className={`proof${visible ? ' show' : ''}`} role="status" aria-live="polite">
      <div className="proof-dot" aria-hidden="true" />
      <div className="proof-text">
        <strong>{current.name ?? 'Uma pessoa'}</strong> descobriu <strong>{current.career}</strong> como 1º caminho
        <span className="proof-time"> · {ago(current.minutes_ago)}</span>
      </div>
      <button type="button" className="proof-close" aria-label="Fechar notificações" onClick={() => { setClosed(true); storage.set('mc_proof_off', '1'); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}
