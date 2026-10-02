// WhatsApp brasileiro: normaliza para dígitos E.164 sem "+" (ex.: 5511987654321).

const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Retorna "55DDNNNNNNNNN" ou null se não for um celular brasileiro válido. */
export function normalizeBrPhone(input: string): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  else if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1); // 0 + DDD
  if (d.length !== 11) return null; // celular: DDD + 9 dígitos
  const ddd = Number(d.slice(0, 2));
  if (!VALID_DDD.has(ddd) || d[2] !== '9') return null;
  return `55${d}`;
}

/** Máscara para digitação: (11) 98765-4321 */
export function maskBrPhone(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatBrPhone(e164: string): string {
  return maskBrPhone(e164.startsWith('55') ? e164.slice(2) : e164);
}

/** Exibição parcial para logs e telas públicas: (11) 9****-4321 */
export function maskForDisplay(e164: string): string {
  const d = e164.startsWith('55') ? e164.slice(2) : e164;
  return `(${d.slice(0, 2)}) ${d[2]}****-${d.slice(-4)}`;
}
