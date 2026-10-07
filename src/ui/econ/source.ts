/**
 * Where the economy screens get their data: the real API (signed in through
 * Telegram, src/platform/cloud.ts) or, for the layout check and the gallery,
 * an in-memory demo (src/ui/econ/demo.ts). Every call rejects with an
 * ApiError-like value when the API cannot be used; the screens turn that into
 * an "available in Telegram" / "offline" / "closed" state (econState).
 */
import { online } from '../../platform/cloud';
import {
  ApiError,
  isApiError,
  newRequestId,
  type BuyResult,
  type ConsumableKey,
  type CosmeticInfo,
  type Currency,
  type EconomyCatalog,
  type MarketListing,
  type MarketListRequest,
  type MarketQuery,
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
  /** Can the player sign in at all (inside Telegram)? */
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
  marketSearch(q: MarketQuery): Promise<{ listings: MarketListing[]; next: number | null }>;
  marketMine(): Promise<{ listings: MarketListing[]; open: number; maxOpen: number }>;
  marketTowns(): Promise<{ towns: { q: number; r: number }[] }>;
  marketList(body: MarketListRequest): Promise<{ listing: MarketListing }>;
  marketBuy(id: string): Promise<{ listing: MarketListing; paid: number; fee: number; sellerGets: number }>;
  marketCancel(id: string): Promise<unknown>;
  /** Buy a Drachmae pack with Telegram Stars: invoice, payment sheet, then wait for the credit. */
  buyPack(productId: string, onStage?: (s: 'invoice' | 'paying' | 'confirming') => void): Promise<PackResult>;
}

const outside = () => new ApiError(0, 'outside', 'Available in Telegram');

/** The real API through the signed-in client. */
export class ApiEconSource implements EconSource {
  readonly demo = false;

  available(): boolean {
    return online.available;
  }

  private async api() {
    if (!online.available) throw outside();
    if (!(await online.signIn())) throw new ApiError(0, 'network', 'Cannot reach the server');
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
  async marketSearch(q: MarketQuery) {
    return (await this.api()).marketSearch(q);
  }
  async marketMine() {
    return (await this.api()).marketMine();
  }
  async marketTowns() {
    return (await this.api()).marketTowns();
  }
  async marketList(body: MarketListRequest) {
    return (await this.api()).marketList(body);
  }
  async marketBuy(id: string) {
    return (await this.api()).marketBuy(id);
  }
  async marketCancel(id: string) {
    return (await this.api()).marketCancel(id);
  }

  async buyPack(productId: string, onStage?: (s: 'invoice' | 'paying' | 'confirming') => void): Promise<PackResult> {
    if (!online.available) return 'unavailable';
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
    const status = await openInvoiceLink(link);
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

async function openInvoiceLink(link: string): Promise<string> {
  const { openInvoice } = await import('../../platform/telegram');
  return openInvoice(link);
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
