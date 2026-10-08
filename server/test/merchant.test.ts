import { beforeEach, describe, expect, it } from 'vitest';
import { ONLINE_RULES } from '../../src/online/rules';
import { CONSUMABLES } from '../../src/data/consumables';
import { holderCut, merchantDay, merchantStock, MERCHANT, offerPrice, tradingPosts } from '../../src/online/merchants';
import { currentSeason, getShard } from '../src/online/store';
import { DB, fresh, getJson, join, placeArmy, post, sameShard, worldOf, type Player } from './onlineHelpers';

beforeEach(fresh);

let rid = 0;
const reqId = () => `mrq-${Date.now().toString(36)}-${rid++}`;

interface OfferView {
  id: string;
  kind: 'consumable' | 'item';
  ref: string;
  rarity: string;
  slot: string;
  gold: number;
  drachmae: number | null;
  dailyCap: number;
  price: { gold: number | null; drachmae: number | null };
  bought: number;
}

interface Stock {
  kind: string;
  region: string;
  reach: boolean;
  discount: boolean;
  holder: { id: number; you: boolean } | null;
  earned: number;
  gold: number;
  drachmae: number;
  offers: OfferView[];
}

async function shardOf(p: Player) {
  const season = await currentSeason(DB());
  return { season, shard: await getShard(DB(), season.id, p.profile.shard.id) };
}

/** A town of the player's shard (not a capital), with the player's land given up and the army out of sight of it. */
async function aTown(p: Player): Promise<number> {
  const w = worldOf(p);
  const town = w.all().find((r) => r.kind === 'town')!.id;
  await DB().prepare('DELETE FROM online_regions WHERE owner_id = ?1').bind(p.playerId).run();
  await placeArmy(p, w.all().find((r) => r.passable && w.hops(r.id, town) > ONLINE_RULES.sight)!.id);
  return town;
}

async function setGold(p: Player, gold: number) {
  const season = await currentSeason(DB());
  await DB().prepare('UPDATE online_profiles SET gold = ?1 WHERE season_id = ?2 AND player_id = ?3').bind(gold, season.id, p.playerId).run();
}

async function gold(p: Player): Promise<number> {
  return (await getJson<{ resources: { gold: number } }>('/api/online/profile', p.token)).body.resources.gold;
}

async function giveDrachmae(pid: number, n: number) {
  await DB().prepare('INSERT INTO wallets (player_id, drachmae, updated_at) VALUES (?1, ?2, 0) ON CONFLICT (player_id) DO UPDATE SET drachmae = excluded.drachmae').bind(pid, n).run();
}

async function hold(p: Player, h: number, clan: number | null = null) {
  const { season, shard } = await shardOf(p);
  await DB()
    .prepare("INSERT INTO online_regions (season_id, shard_id, loc, occupant, owner_id, clan_id, captured_at, accrued_at) VALUES (?1, ?2, ?3, 'player', ?4, ?5, ?6, ?6)")
    .bind(season.id, shard.id, h, p.playerId, clan, Date.now())
    .run();
}

const stock = (p: Player, h: number) => getJson<Stock & { error?: { code: string } }>(`/api/online/merchant/${h}`, p.token);
const buy = (p: Player, h: number, offer: string, currency: 'gold' | 'drachmae', requestId = reqId()) =>
  post<{ replayed: boolean; order: { price: number; discount: boolean; holderCut: number }; item: { uid: string; def: string; rarity: string } | null; gold: number; error?: { code: string } }>(
    '/api/online/merchant/buy',
    p.token,
    { loc: h, offer, currency, requestId },
  );

describe('map merchants', () => {
  it('a town merchant: reach, stock, consumables for gold and Drachmae, daily caps, idempotency', async () => {
    const p = await join(970001);
    const town = await aTown(p);
    // Hidden by the fog: no stock.
    expect((await stock(p, town)).status).toBe(404);
    // In sight but two routes away: stock shown, out of reach.
    const w = worldOf(p);
    const two = w.within(town, 2).find((h) => w.hops(h, town) === 2 && w.info(h).passable)!;
    await placeArmy(p, two);
    const far = await stock(p, town);
    expect(far.status).toBe(200);
    expect(far.body).toMatchObject({ kind: 'town', reach: false, discount: false, holder: null });
    expect((await buy(p, town, 'c:morale_wine', 'gold')).body.error!.code).toBe('out_of_reach');
    // Next to it: in reach. The region panel names the merchant.
    await placeArmy(p, w.neighbours(town)[0]);
    expect((await getJson<{ merchant: string | null }>(`/api/online/region/${town}`, p.token)).body.merchant).toBe('town');
    const s = (await stock(p, town)).body;
    expect(s.reach).toBe(true);
    const { shard } = await shardOf(p);
    expect(s.offers.map((o) => o.id)).toEqual(merchantStock(shard.world, shard.seed, town, 'town', merchantDay(Date.now())).map((o) => o.id));
    expect(s.offers.filter((o) => o.kind === 'consumable')).toHaveLength(5);
    // Gear is never sold for Drachmae.
    expect(s.offers.filter((o) => o.kind === 'item').every((o) => o.drachmae === null)).toBe(true);

    await setGold(p, 1000);
    await giveDrachmae(p.playerId, 100);
    const wine = CONSUMABLES.morale_wine;
    const id = reqId();
    const a = await buy(p, town, 'c:morale_wine', 'gold', id);
    expect(a.status).toBe(200);
    expect(a.body.order.price).toBe(wine.gold);
    // The same request again: answered from the order, not charged twice.
    const again = await buy(p, town, 'c:morale_wine', 'gold', id);
    expect(again.body.replayed).toBe(true);
    expect(await gold(p)).toBe(1000 - wine.gold!);
    // A request id belongs to one purchase.
    expect((await buy(p, town, 'c:war_horn', 'gold', id)).body.error!.code).toBe('request_reused');
    // Drachmae: the shortcut; the cap counts both currencies.
    expect((await buy(p, town, 'c:morale_wine', 'drachmae')).status).toBe(200);
    expect((await getJson<{ drachmae: number }>('/api/economy/wallet', p.token)).body.drachmae).toBe(100 - wine.drachmae!);
    expect((await buy(p, town, 'c:morale_wine', 'gold')).status).toBe(200);
    const over = await buy(p, town, 'c:morale_wine', 'gold');
    expect(over.status).toBe(409);
    expect(over.body.error!.code).toBe('daily_cap');
    const inv = (await getJson<{ inventory: Record<string, number>; caps: Record<string, { bought: number }> }>('/api/online/consumables', p.token)).body;
    expect(inv.inventory.morale_wine).toBe(wine.dailyCap);
    expect(inv.caps.morale_wine.bought).toBe(wine.dailyCap);
    expect((await stock(p, town)).body.offers.find((o) => o.id === 'c:morale_wine')!.bought).toBe(wine.dailyCap);
    // Yesterday's purchases do not count today.
    await DB().prepare("UPDATE consumable_daily SET day = '2000-01-01' WHERE player_id = ?1").bind(p.playerId).run();
    expect((await buy(p, town, 'c:morale_wine', 'gold')).status).toBe(200);

    // Gear: into the stash, gold only, its own daily cap.
    const gear = s.offers.find((o) => o.slot === 'base' && o.kind === 'item')!;
    expect((await buy(p, town, gear.id, 'drachmae')).status).toBe(400);
    await setGold(p, 10_000);
    const g = await buy(p, town, gear.id, 'gold');
    expect(g.status).toBe(200);
    expect(g.body.item).toMatchObject({ def: gear.ref, rarity: 'common' });
    const stash = (await getJson<{ stash: { uid: string }[] }>('/api/online/profile', p.token)).body.stash;
    expect(stash.map((x) => x.uid)).toContain(g.body.item!.uid);
    for (let i = 1; i < MERCHANT.gearCap.base; i++) expect((await buy(p, town, gear.id, 'gold')).status).toBe(200);
    expect((await buy(p, town, gear.id, 'gold')).body.error!.code).toBe('daily_cap');
    // Not on sale here today.
    expect((await buy(p, town, 'i:aspis:legendary', 'gold')).body.error!.code).toBe('no_offer');
    // Too poor.
    await setGold(p, 5);
    expect((await buy(p, town, 'c:war_horn', 'gold')).body.error!.code).toBe('insufficient_funds');
    // The menu shop no longer sells consumables.
    expect((await post<{ error: { code: string } }>('/api/economy/buy', p.token, { requestId: reqId(), item: 'morale_wine', currency: 'drachmae' })).body.error.code).toBe('merchant_only');
  });

  it('the holder and their clan pay 10% less; the holder earns 5% of the list price of sales to others', async () => {
    const owner = await join(970101, 'Owner');
    const mate = await join(970102, 'Mate');
    const stranger = await join(970103, 'Stranger');
    await sameShard(owner, mate, stranger);
    const town = await aTown(owner);
    // The owner holds the town from afar (no army there: holding is enough).
    const cl = await post<{ clan: { id: number } }>('/api/online/clans', owner.token, { name: 'Merchants Guild', tag: 'MRC' });
    expect(cl.status).toBe(200);
    const inv = await post<{ code: string }>('/api/online/clans/invite', owner.token);
    expect((await post('/api/online/clans/join', mate.token, { code: inv.body.code })).status).toBe(200);
    await hold(owner, town, cl.body.clan.id);
    for (const p of [owner, mate, stranger]) await setGold(p, 1000);
    await placeArmy(stranger, worldOf(owner).neighbours(town)[1]);
    await placeArmy(mate, town);

    const so = (await stock(owner, town)).body;
    expect(so).toMatchObject({ reach: true, discount: true, holder: { id: owner.playerId, you: true } });
    const horn = so.offers.find((o) => o.id === 'c:war_horn')!;
    const cheap = offerPrice(horn, 'gold', true)!;
    expect(horn.price.gold).toBe(cheap);
    expect(cheap).toBe(Math.round(horn.gold * 0.9));
    // The owner's own purchase: discounted, no cut.
    const o1 = await buy(owner, town, 'c:war_horn', 'gold');
    expect(o1.body.order).toMatchObject({ price: cheap, discount: true, holderCut: 0 });
    expect(await gold(owner)).toBe(1000 - cheap);
    // A clan mate: discounted; the owner earns the cut.
    const m1 = await buy(mate, town, 'c:war_horn', 'gold');
    expect(m1.body.order).toMatchObject({ price: cheap, discount: true, holderCut: holderCut(horn) });
    // A stranger next door: full price, in Drachmae too; the cut is still gold of the list price.
    expect((await stock(stranger, town)).body).toMatchObject({ reach: true, discount: false });
    const s1 = await buy(stranger, town, 'c:war_horn', 'gold');
    expect(s1.body.order).toMatchObject({ price: horn.gold, discount: false, holderCut: holderCut(horn) });
    await giveDrachmae(stranger.playerId, 50);
    expect((await buy(stranger, town, 'c:healing_salve', 'drachmae')).status).toBe(200);
    const salveCut = Math.floor(CONSUMABLES.healing_salve.gold! * MERCHANT.ownerCut);
    expect(await gold(stranger)).toBe(1000 - horn.gold);
    expect(await gold(owner)).toBe(1000 - cheap + 2 * holderCut(horn) + salveCut);
    expect((await stock(owner, town)).body.earned).toBe(2 * holderCut(horn) + salveCut);
  });

  it('trading posts: rarer stock, shown on the map', async () => {
    const p = await join(970201);
    const { shard } = await shardOf(p);
    const posts = tradingPosts(shard.world);
    expect(posts.length).toBeGreaterThan(0);
    const tp = posts[0];
    await placeArmy(p, tp.loc);
    const s = await stock(p, tp.loc);
    expect(s.status).toBe(200);
    expect(s.body.kind).toBe(tp.kind);
    expect(s.body.offers.some((o) => o.rarity === 'epic' && o.slot === 'rare')).toBe(true);
    expect(s.body.offers.filter((o) => o.slot === 'region').every((o) => o.rarity === 'rare')).toBe(true);
    const map = (await getJson<{ regions: { loc: number; post?: string }[] }>('/api/online/map', p.token)).body;
    expect(map.regions.find((h) => h.loc === tp.loc)?.post).toBe(tp.kind);
    // A plain region has no merchant.
    const plain = shard.world.neighbours(tp.loc).find((h) => shard.world.info(h).kind === 'plot')!;
    expect((await stock(p, plain)).body.error!.code).toBe('no_merchant');
  });
});
