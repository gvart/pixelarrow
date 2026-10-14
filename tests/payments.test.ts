/**
 * The shop's Drachmae packs pay through platform.payments (ADR-0006 M7): no
 * invoice is ever asked for when the platform cannot pay (the web), and a
 * Telegram Stars purchase pays the server's link through the adapter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platform, setPlatformForTests } from '../src/platform/index';
import { online } from '../src/platform/cloud';
import { ApiEconSource, packLegalKey } from '../src/ui/econ/source';
import { t } from '../src/i18n';
import { FakePlatform } from './fakes/platform';

const before = platform;
let fake: FakePlatform;
let invoices: string[];
let drachmae: number;

beforeEach(() => {
  fake = new FakePlatform();
  setPlatformForTests(fake);
  invoices = [];
  drachmae = 10;
  vi.spyOn(online, 'ensureSession').mockResolvedValue('live');
  vi.spyOn(online, 'signedIn', 'get').mockReturnValue(true);
  vi.spyOn(online.api, 'invoice').mockImplementation(async (productId: string) => {
    invoices.push(productId);
    return { link: `https://t.me/$invoice-${productId}`, productId, stars: 100 };
  });
  vi.spyOn(online.api, 'wallet').mockImplementation(async () => ({ drachmae }) as never);
});

afterEach(() => {
  setPlatformForTests(before);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('buying a Drachmae pack', () => {
  for (const reason of ['coming_soon', 'signed_out', 'offline'] as const) {
    it(`asks for no invoice when payments are unavailable (${reason})`, async () => {
      fake.payStatus = { available: false, reason };
      expect(await new ApiEconSource().buyPack('drachmae_100')).toBe('unavailable');
      expect(invoices).toEqual([]);
      expect(fake.paid).toEqual([]);
    });
  }

  it('pays the server invoice link through the platform when Stars are available', async () => {
    fake.payStatus = { available: true, provider: 'telegram_stars' };
    fake.payResult = 'cancelled';
    const stages: string[] = [];
    expect(await new ApiEconSource().buyPack('drachmae_100', (s) => stages.push(s))).toBe('cancelled');
    expect(invoices).toEqual(['drachmae_100']);
    expect(fake.paid).toEqual([{ link: 'https://t.me/$invoice-drachmae_100' }]);
    expect(stages).toEqual(['invoice', 'paying']);
  });

  it('waits for the credit after a paid invoice', async () => {
    vi.useFakeTimers();
    fake.payStatus = { available: true, provider: 'telegram_stars' };
    fake.payResult = 'paid';
    const r = new ApiEconSource().buyPack('drachmae_100');
    await vi.advanceTimersByTimeAsync(100);
    drachmae = 110; // the webhook credited the pack
    await vi.advanceTimersByTimeAsync(1000);
    expect(await r).toBe('credited');
  });

  it('reports a failed payment', async () => {
    fake.payStatus = { available: true, provider: 'telegram_stars' };
    fake.payResult = 'failed';
    expect(await new ApiEconSource().buyPack('drachmae_100')).toBe('failed');
  });
});

describe('the wallet copy is keyed to the payment provider', () => {
  it('shows the Stars legal line only where Telegram Stars is the provider', () => {
    expect(packLegalKey({ available: true, provider: 'telegram_stars' })).toBe('wallet.legal');
    // Telegram whose payment sheet can't open right now: still Stars
    expect(packLegalKey({ available: false, reason: 'offline' })).toBe('wallet.legal');
    expect(packLegalKey({ available: false, reason: 'coming_soon' })).toBe('shop.web.legal');
    expect(t('shop.web.legal')).not.toMatch(/star/i);
  });
});
