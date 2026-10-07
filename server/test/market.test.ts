import { beforeEach, describe, expect, it } from 'vitest';
import { marketFee } from '../src/economy/catalog';
import { currentSeason, getShard } from '../src/online/store';
import { resetRateLimits } from '../src/rateLimit';
import { DB, fresh, getJson, join, placeArmy, post, sameShard, type Player } from './onlineHelpers';

beforeEach(fresh);

interface Listing {
  id: string;
  kind: string;
  ref: string;
  qty: number;
  currency: string;
  price: number;
  status: string;
  mine: boolean;
  item: { uid: string } | null;
}

/** Puts the player's army in a town of their shard (so they can list there). */
async function toTown(p: Player): Promise<number> {
  const season = await currentSeason(DB());
  const shard = await getShard(DB(), season.id, p.profile.shard.id);
  const town = shard.world.all().find((r) => r.kind === 'town')!.id;
  await placeArmy(p, town);
  return town;
}

async function profile(p: Player) {
  return (await getJson<{ resources: { gold: number; food: number; wood: number }; stash: { uid: string }[]; consumables: Record<string, number> }>('/api/online/profile', p.token)).body;
}

async function setPurse(p: Player, gold: number, wood = 0) {
  const season = await currentSeason(DB());
  await DB().prepare('UPDATE online_profiles SET gold = ?1, wood = ?2 WHERE season_id = ?3 AND player_id = ?4').bind(gold, wood, season.id, p.playerId).run();
}

async function giveDrachmae(pid: number, n: number) {
  await DB().prepare('INSERT INTO wallets (player_id, drachmae, updated_at) VALUES (?1, ?2, 0) ON CONFLICT (player_id) DO UPDATE SET drachmae = excluded.drachmae').bind(pid, n).run();
}

async function drachmae(p: Player): Promise<number> {
  return (await getJson<{ drachmae: number }>('/api/economy/wallet', p.token)).body.drachmae;
}

/** An item in the player's stash (unequips the first hero's helmet or any slot). */
async function stashItem(p: Player): Promise<string> {
  const prof = await profile(p);
  if (prof.stash.length) return prof.stash[0].uid;
  const heroes = (await getJson<{ heroes: { hero: { id: string; equip: Record<string, { uid: string }> } }[] }>('/api/online/profile', p.token)).body.heroes;
  for (const h of heroes) {
    const slot = Object.keys(h.hero.equip)[0];
    if (slot) {
      expect((await post('/api/online/equip', p.token, { heroId: h.hero.id, slot, itemUid: null })).status).toBe(200);
      return (await profile(p)).stash[0].uid;
    }
  }
  throw new Error('no item');
}

describe('town marketplace', () => {
  it('lists an item into escrow, sells it for gold with a 10% fee burned, and the buyer gets it', async () => {
    const s = await join(960001, 'Seller');
    const b = await join(960002, 'Buyer');
    await sameShard(s, b);
    const town = await toTown(s);
    const uid = await stashItem(s);
    // Not in a reachable town: refused.
    const far = await post<{ error: { code: string } }>('/api/online/market/list', s.token, { town: s.profile.home, kind: 'item', ref: uid, currency: 'gold', price: 100 });
    expect(far.status).toBe(403);
    // Price bounds per rarity.
    expect((await post<{ error: { code: string } }>('/api/online/market/list', s.token, { town, kind: 'item', ref: uid, currency: 'gold', price: 1 })).body.error.code).toBe('price_out_of_bounds');
    const l = await post<{ listing: Listing }>('/api/online/market/list', s.token, { town, kind: 'item', ref: uid, currency: 'gold', price: 100 });
    expect(l.status).toBe(200);
    expect(l.body.listing).toMatchObject({ kind: 'item', status: 'open', mine: true, price: 100 });
    expect((await profile(s)).stash.map((x) => x.uid)).not.toContain(uid); // escrow

    // Search: filters and pagination.
    const found = await getJson<{ listings: Listing[]; next: number | null }>(`/api/online/market?kind=item&currency=gold&maxPrice=100`, b.token);
    expect(found.body.listings.map((x) => x.id)).toContain(l.body.listing.id);
    expect((await getJson<{ listings: Listing[] }>(`/api/online/market?kind=item&minPrice=101`, b.token)).body.listings.map((x) => x.id)).not.toContain(l.body.listing.id);
    expect((await getJson<{ listings: Listing[] }>(`/api/online/market?currency=drachmae`, b.token)).body.listings.map((x) => x.id)).not.toContain(l.body.listing.id);

    // Self-buy refused; insufficient gold refused.
    const self = await post<{ error: { code: string } }>('/api/online/market/buy', s.token, { listingId: l.body.listing.id });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('self_buy');
    await setPurse(b, 50);
    const poor = await post<{ error: { code: string } }>('/api/online/market/buy', b.token, { listingId: l.body.listing.id });
    expect(poor.body.error.code).toBe('insufficient_funds');

    await setPurse(b, 500);
    await setPurse(s, 0);
    const buy = await post<{ paid: number; fee: number; sellerGets: number }>('/api/online/market/buy', b.token, { listingId: l.body.listing.id });
    expect(buy.status).toBe(200);
    expect(buy.body).toEqual({ ...buy.body, paid: 100, fee: 10, sellerGets: 90 });
    expect((await profile(b)).resources.gold).toBe(400);
    expect((await profile(b)).stash.map((x) => x.uid)).toContain(uid);
    expect((await profile(s)).resources.gold).toBe(90); // 10 burned
    // Sold: cannot be bought or cancelled again.
    expect((await post<{ error: { code: string } }>('/api/online/market/buy', b.token, { listingId: l.body.listing.id })).body.error.code).toBe('sold');
    expect((await post('/api/online/market/cancel', s.token, { listingId: l.body.listing.id })).status).toBe(409);
    const audit = await DB().prepare('SELECT action, fee FROM market_audit WHERE listing_id = ?1 ORDER BY id').bind(l.body.listing.id).all<{ action: string; fee: number | null }>();
    expect(audit.results).toEqual([
      { action: 'list', fee: null },
      { action: 'buy', fee: 10 },
    ]);
  });

  it('Drachmae listings: buyer pays, seller gets 90%, the fee is burned; concurrent double-buy sells once', async () => {
    const s = await join(960101);
    const b1 = await join(960102);
    const b2 = await join(960103);
    await sameShard(s, b1, b2);
    const town = await toTown(s);
    await setPurse(s, 0, 500);
    const l = await post<{ listing: Listing }>('/api/online/market/list', s.token, { town, kind: 'resource', ref: 'wood', qty: 200, currency: 'drachmae', price: 50 });
    expect(l.status).toBe(200);
    expect((await profile(s)).resources.wood).toBe(300);
    await giveDrachmae(b1.playerId, 100);
    await giveDrachmae(b2.playerId, 100);
    const wood0 = [(await profile(b1)).resources.wood, (await profile(b2)).resources.wood];
    const [r1, r2] = await Promise.all([
      post('/api/online/market/buy', b1.token, { listingId: l.body.listing.id }),
      post('/api/online/market/buy', b2.token, { listingId: l.body.listing.id }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const [winner, loser, w0, l0] = r1.status === 200 ? [b1, b2, wood0[0], wood0[1]] : [b2, b1, wood0[1], wood0[0]];
    expect(await drachmae(winner)).toBe(50);
    expect(await drachmae(loser)).toBe(100);
    expect(await drachmae(s)).toBe(50 - marketFee(50));
    expect((await profile(winner)).resources.wood).toBe(w0 + 200);
    expect((await profile(loser)).resources.wood).toBe(l0);
  });

  it('cancel returns the goods; expiry returns them lazily; listing cap; resources and consumables escrow', async () => {
    const s = await join(960201);
    const b = await join(960202);
    await sameShard(s, b);
    const town = await toTown(s);
    const season = await currentSeason(DB());
    await DB().prepare("INSERT INTO online_consumables (season_id, player_id, consumable_id, qty) VALUES (?1, ?2, 'morale_wine', 3)").bind(season.id, s.playerId).run();
    expect((await post('/api/online/market/list', s.token, { town, kind: 'consumable', ref: 'morale_wine', qty: 4, currency: 'gold', price: 100 })).status).toBe(409);
    const l = await post<{ listing: Listing }>('/api/online/market/list', s.token, { town, kind: 'consumable', ref: 'morale_wine', qty: 2, currency: 'gold', price: 100 });
    expect(l.status).toBe(200);
    expect((await profile(s)).consumables.morale_wine).toBe(1);
    expect((await post('/api/online/market/cancel', b.token, { listingId: l.body.listing.id })).status).toBe(403);
    expect((await post('/api/online/market/cancel', s.token, { listingId: l.body.listing.id })).status).toBe(200);
    expect((await profile(s)).consumables.morale_wine).toBe(3);
    expect((await post('/api/online/market/cancel', s.token, { listingId: l.body.listing.id })).status).toBe(409);

    // Expiry: nobody can buy it; the goods come back when the seller looks.
    const e = await post<{ listing: Listing }>('/api/online/market/list', s.token, { town, kind: 'consumable', ref: 'morale_wine', qty: 3, currency: 'gold', price: 100 });
    await DB().prepare('UPDATE market_listings SET expires_at = ?2 WHERE id = ?1').bind(e.body.listing.id, Date.now() - 1).run();
    await setPurse(b, 1000);
    const late = await post<{ error: { code: string } }>('/api/online/market/buy', b.token, { listingId: e.body.listing.id });
    expect(late.status).toBe(410);
    expect((await getJson<{ listings: Listing[] }>('/api/online/market', b.token)).body.listings.map((x) => x.id)).not.toContain(e.body.listing.id);
    const mine = await getJson<{ listings: Listing[]; open: number }>('/api/online/market/mine', s.token);
    expect(mine.body.listings.find((x) => x.id === e.body.listing.id)!.status).toBe('expired');
    expect((await profile(s)).consumables.morale_wine).toBe(3);

    // Listing cap.
    await setPurse(s, 0, 1000);
    resetRateLimits(); // listing is rate limited at 20 a minute
    for (let i = 0; i < 20; i++) {
      const r = await post('/api/online/market/list', s.token, { town, kind: 'resource', ref: 'wood', qty: 1, currency: 'gold', price: 10 });
      expect(r.status).toBe(200);
    }
    resetRateLimits();
    const capped = await post<{ error: { code: string } }>('/api/online/market/list', s.token, { town, kind: 'resource', ref: 'wood', qty: 1, currency: 'gold', price: 10 });
    expect(capped.body.error.code).toBe('listing_cap');
    expect((await profile(s)).resources.wood).toBe(980);
    // Pagination over the seller's 20 listings.
    const p1 = await getJson<{ listings: Listing[]; next: number | null }>('/api/online/market?kind=resource&ref=wood&limit=15', b.token);
    expect(p1.body.listings).toHaveLength(15);
    expect(p1.body.next).toBe(15);
    const p2 = await getJson<{ listings: Listing[]; next: number | null }>(`/api/online/market?kind=resource&ref=wood&limit=15&cursor=${p1.body.next}`, b.token);
    expect(p2.body.listings.length).toBeGreaterThanOrEqual(5);
    // Gold, recruits and unknown resources cannot be listed.
    expect((await post('/api/online/market/list', s.token, { town, kind: 'resource', ref: 'gold', qty: 1, currency: 'drachmae', price: 10 })).status).toBe(400);
  });
});
