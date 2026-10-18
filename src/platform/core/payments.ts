/** Paying for packs. The server's invoice and grant logic do not depend on the provider. */
export type PaymentStatus = { available: true; provider: 'telegram_stars' } | { available: false; reason: 'coming_soon' | 'signed_out' | 'offline' };
export type PaymentResult = 'paid' | 'pending' | 'cancelled' | 'failed';

export interface Payments {
  status(): PaymentStatus;
  pay(invoice: { provider: 'telegram_stars'; link: string }): Promise<PaymentResult>;
}
