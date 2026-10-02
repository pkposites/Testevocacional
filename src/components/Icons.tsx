// Ícones das 6 áreas de interesse (traço simples, herdam a cor do texto).
import type { ReactElement } from 'react';
type Props = { size?: number; className?: string };

const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

const PATHS: Record<string, ReactElement> = {
  // Prática: chave inglesa
  P: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.6 17.4a1.9 1.9 0 0 0 2.7 2.7l5.7-5.7a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.5-.5-2.2z" />,
  // Análise: lupa sobre barras
  A: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8" /><path d="M8 12.5v-2M10.5 12.5V8M13 12.5v-3" /></>,
  // Criação: pincel com brilho
  C: <><path d="M15.5 4.5l4 4L10 18H6v-4z" /><path d="M13.5 6.5l4 4" /><path d="M4 4l1 2M3 8h2M7 3v2" /></>,
  // Colaboração: duas pessoas
  S: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" /></>,
  // Negociação e iniciativa: megafone
  N: <><path d="M4 10v4a1 1 0 0 0 1 1h2l7 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M18 9a4 4 0 0 1 0 6" /><path d="M8 15l1.5 4.5" /></>,
  // Organização: prancheta com checks
  O: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M8.5 12l1.5 1.5 2.5-2.5M8.5 17l1.5 1.5 2.5-2.5M14.5 12.5h2M14.5 17.5h2" /></>,
};

export function DimIcon({ dim, size = 20, className }: Props & { dim: string }) {
  const p = PATHS[dim];
  if (!p) return null;
  return <svg {...base(size)} className={className}>{p}</svg>;
}

export function LockIcon({ size = 18, className }: Props) {
  return <svg {...base(size)} className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}

export function SparkIcon({ size = 18, className }: Props) {
  return <svg {...base(size)} className={className}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;
}

export function CheckIcon({ size = 16, className }: Props) {
  return <svg {...base(size)} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
