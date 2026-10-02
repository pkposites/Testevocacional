// Nomes dos eventos no Pixel/API de Conversões da Meta. Interno → Meta.
// Padrão: Lead e Purchase. Personalizados: QuizComplete (teste completo, alto engajamento) e DiagnosticInterest.
export const META_EVENT_NAMES = {
  GameComplete: 'QuizComplete',
  Lead: 'Lead',
  DiagnosticInterest: 'DiagnosticInterest',
  Purchase: 'Purchase',
} as const;
export type MetaEventKey = keyof typeof META_EVENT_NAMES;
export const META_STANDARD_EVENTS = new Set(['PageView', 'Lead', 'Purchase', 'InitiateCheckout']);

export const eventIds = {
  gameComplete: (sessionId: string, revision: number) => `gamecomplete_${sessionId}_${revision}`,
  lead: (orderId: string) => `lead_${orderId}`,
  interest: (orderId: string) => `interest_${orderId}`,
  purchase: (orderId: string) => `purchase_${orderId}`,
};
