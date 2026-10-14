/**
 * The browser has no payment provider yet (ROADMAP v6 "Payments"): every
 * purchase is "coming soon" and nothing can be paid. A real provider plugs in
 * here, behind the same Payments interface, without touching the shop or the
 * server's grant logic (ADR-0006).
 */
import type { Payments } from '../core/payments';

export const webPayments: Payments = {
  status: () => ({ available: false, reason: 'coming_soon' }),
  pay: async () => 'failed',
};
