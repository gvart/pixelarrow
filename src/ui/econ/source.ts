/**
 * Where the economy screens get their data: the real API (signed in through
 * Telegram, src/platform/cloud.ts) or, for the layout check and the gallery,
 * an in-memory demo (src/ui/econ/demo.ts). Every call rejects with an
 * ApiError-like value when the API cannot be used; the screens turn that into
 * an "available in Telegram" / "offline" / "closed" state (econState).
 */
import { online } from '../../platform/cloud';
import { platform } from '../../platform';
import type { PaymentStatus } from '../../platform/core/payments';
import {
  ApiError,
  isApiError,
  newRequestId,
  type BuyResult,
  type ConsumableKey,
  type CosmeticInfo,
  type Currency,
  type EconomyCatalog,
  type PassReward,
  type SeasonPassInfo,
  type WalletInfo,
} from '../../platform/api';
import { onlineApi, type ProfileView } from '../../online/client';

export interface ConsumableInfo {
  inventory: Partial<Record<ConsumableKey, number>>;
  day: string;
  caps: Record<string, { cap: number; bought: number }>;
}

export type PackResult = 'credited' | 'pending' | 'cancelled' | 'failed' | 'offline' | 'unavailable';

export interface EconSource {
  readonly demo: boolean;
  /** Is there a session, or a way to sign in here? (false: the "Sign in to play online" state) */
  available(): boolean;
  catalog(): Promise<EconomyCatalog>;
  wallet(): Promise<WalletInfo>;
  buy(item: string, opts?: { currency?: Currency; qty?: number; requestId?: string }): Promise<BuyResult>;
  equipCosmetic(slot: CosmeticInfo['slot'], id: string | null): Promise<{ loadout: Record<string, string> }>;
  pass(): Promise<SeasonPassInfo>;
  claimPass(tier: number, track: 'free' | 'premium'): Promise<{ reward: PassReward; replayed: boolean }>;
  consumables(): Promise<ConsumableInfo>;
  useConsumable(id: ConsumableKey): Promise<{ inventory: Partial<Record<ConsumableKey, number>> }>;
  /** The season profile (gold, stash) or null when the player has not joined the season. */
  profile(): Promise<ProfileView | null>;
  /** Buy a Drachmae pack through platform.payments: invoice, payment sheet, then wait for the credit ('unavailable' when the platform cannot pay). */
  buyPack(productId: string, onStage?: (s: 'invoice' | 'paying' | 'confirming') => void): Promise<PackResult>;
}

const outside = () => new ApiError(0, 'outside', 'Signed out');

/** The real API through the signed-in client. */
export class ApiEconSource implements EconSource {
  readonly demo = false;

  available(): boolean {
    return online.signedIn || online.canSignIn();
  }

  private async api() {
    const s = await online.ensureSession();
    if (s === 'signed_out') throw outside();
    if (s === 'offline') throw new ApiError(0, 'network', 'Cannot reach the server');
    return online.api;
  }

  catalog(): Promise<EconomyCatalog> {
    // public, no sign-in needed
    return online.api.economyCatalog();
  }
  async wallet() {
    return (await this.api()).wallet();
  }
  async buy(item: string, opts: { currency?: Currency; qty?: number; requestId?: string } = {}) {
    return (await this.api()).buy(item, opts);
  }
  async equipCosmetic(slot: CosmeticInfo['slot'], id: string | null) {
    return (await this.api()).equipCosmetic(slot, id);
  }
  async pass() {
    return (await this.api()).seasonPass();
  }
  async claimPass(tier: number, track: 'free' | 'premium') {
    return (await this.api()).claimPass(tier, track);
  }
  async consumables() {
    return (await this.api()).consumables();
  }
  async useConsumable(id: ConsumableKey) {
    return (await this.api()).useConsumable(id);
  }
  async profile(): Promise<ProfileView | null> {
    await this.api();
    try {
      return await onlineApi.profile();
    } catch (e) {
      if (isApiError(e) && e.code === 'no_profile') return null;
      throw e;
    }
  }

  async buyPack(productId: string, onStage?: (s: 'invoice' | 'paying' | 'confirming') => void): Promise<PackResult> {
    // no invoice unless this platform can pay it (the web: coming soon); the shop shows status().reason
    const pay = platform.payments.status();
    if (!pay.available || !this.available()) return 'unavailable';
    let api;
    try {
      api = await this.api();
    } catch {
      return 'offline';
    }
    const before = await api.wallet().then((w) => w.drachmae).catch(() => null);
    let link: string;
    try {
      onStage?.('invoice');
      link = (await api.invoice(productId)).link;
    } catch (e) {
      return isApiError(e) && e.offline ? 'offline' : 'failed';
    }
    onStage?.('paying');
    const status = await platform.payments.pay({ provider: pay.provider, link });
    if (status === 'cancelled') return 'cancelled';
    if (status !== 'paid' && status !== 'pending') return 'failed';
    onStage?.('confirming');
    // the credit arrives through the bot webhook: poll the wallet briefly
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1500));
      const w = await api.wallet().catch(() => null);
      if (w && (before === null || w.drachmae > before)) return 'credited';
    }
    return 'pending';
  }
}

/**
 * The wallet's legal line, keyed to the payment provider (ADR-0006): the Stars
 * line while Telegram Stars is this platform's provider (also when Telegram's
 * sheet can't open right now), the plain line where no provider exists yet.
 */
export function packLegalKey(s: PaymentStatus): 'wallet.legal' | 'shop.web.legal' {
  if (s.available) return s.provider === 'telegram_stars' ? 'wallet.legal' : 'shop.web.legal';
  return s.reason === 'coming_soon' ? 'shop.web.legal' : 'wallet.legal';
}

let current: EconSource | null = null;

/** The source the screens use (the real API unless a demo was set). */
export function econ(): EconSource {
  return (current ??= new ApiEconSource());
}

/** Swap the source (demo data for the layout check, tests). */
export function setEconSource(s: EconSource | null): void {
  current = s;
}

export { newRequestId };
