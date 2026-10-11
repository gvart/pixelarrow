/**
 * AR-04: the Tyrant's host and the end state (design/gdd/campaign-arc.md R4,
 * R5, R6, F2): it musters when the last lair falls, sized from the fit
 * roster, marches on the starting town and sacks it, can be beaten; victory
 * sets 'won' and drops a legendary set piece; the post-game's reborn lairs
 * drop only missing pieces on a 10-day cooldown. Old saves reach the host.
 */
import { describe, expect, it } from 'vitest';
import { ARC_LAIRS, HOST, POST_GAME, SACK_DAYS } from '../src/data/arc';
import { itemDef } from '../src/data/items';
import { Campaign } from '../src/game/campaign';
import { deserialize, serialize } from '../src/game/save';
import type { Outcome } from '../src/game/loot';
import { arcSet } from '../src/game/sources';
import { setPieces } from '../src/data/sets';
import { isCaptain } from '../src/sim/stats';
import { dangerAt, townsFarthestFirst } from '../src/world/map';
import { hostSize, partyArmy, type PlayerInfo } from '../src/world/world';

const FIXTURES = import.meta.glob<string>('./fixtures/saves/*.json', { eager: true, query: '?raw', import: 'default' });
const fixture = (tag: string) => Object.entries(FIXTURES).find(([f]) => f.includes(tag))![1];

const outcome = (victory: boolean, killed = 0): Outcome => ({ victory, draw: false, gold: 0, picks: victory ? 2 : 0, loot: [], heroes: [], enemyKilled: killed, enemyTotal: 20, lost: 0 });
const lairs = (c: Campaign) => c.world.map.settlements.filter((s) => s.kind === 'lair');
const PLAYER: PlayerInfo = { power: 1, size: 8 };

/** A campaign whose every lair but the last has fallen (the deck emptied, so no card pauses the map). */
function nearEnd(seed = 5): Campaign {
  const c = Campaign.fresh(seed);
  c.world.deck = [];
  for (const st of lairs(c).slice(0, ARC_LAIRS - 1)) c.razeLair(st.id);
  return c;
}

function musterAll(seed = 5): Campaign {
  const c = nearEnd(seed);
  c.razeLair(lairs(c)[ARC_LAIRS - 1].id);
  return c;
}

describe('the host musters (R5.1, R5.2, F2)', () => {
  it('F2: min(32, ceil(HOST_MULT x R)), R at least 1', () => {
    for (const r of [1, 8, 16, 20]) expect(hostSize(r)).toBe(Math.min(HOST.cap, Math.ceil(HOST.mult * r)));
    expect(hostSize(0)).toBe(hostSize(1));
    expect(hostSize(16)).toBe(16); // AR-04 tuned HOST_MULT to 1.0 (the GDD's range is 1.0-1.5)
    expect(hostSize(40)).toBe(HOST.cap);
  });

  it('only when the last lair falls: stage host, the flag set, at the farthest town, marching on the start', () => {
    const c = nearEnd();
    expect(c.world.s.arc.stage).toBe('lairs');
    expect(c.world.host).toBeNull();
    expect(c.world.hasFlag('host_musters')).toBe(false);
    c.razeLair(lairs(c)[ARC_LAIRS - 1].id);
    const w = c.world;
    const h = w.host!;
    expect(w.s.arc).toEqual({ stage: 'host', hostParty: h.id });
    expect(w.hasFlag('host_musters')).toBe(true);
    expect(h.kind).toBe('host');
    expect(h.home).toBe(townsFarthestFirst(w.map)[0].id);
    const start = w.map.settlements[w.map.start];
    expect([h.tx, h.ty]).toEqual([start.x, start.y]);
    expect(Math.hypot(h.x - w.s.x, h.y - w.s.y)).toBeGreaterThanOrEqual(HOST.minDist - 4);
    expect(h.level).toBeGreaterThanOrEqual(HOST.level[0]);
    expect(h.level).toBeLessThanOrEqual(HOST.level[1]);
    expect(h.tier).toBe(3);
  });

  it('is sized from the fit roster when it musters: the wounded and fielding fewer men do not shrink it later', () => {
    const c = nearEnd();
    c.data.heroes.slice(0, 3).forEach((h) => (h.wound = 10));
    const fit = c.data.heroes.length - 3;
    c.razeLair(lairs(c)[ARC_LAIRS - 1].id);
    expect(c.world.host!.size).toBe(hostSize(fit));
    for (const h of c.data.heroes) h.wound = 0;
    c.checkArc();
    expect(c.world.host!.size).toBe(hostSize(fit));
  });

  it('the host army: the Tyrant (level 10, legendary weapon) leads hammer men of two cultures who hold the field', () => {
    const c = musterAll();
    const h = c.world.host!;
    const army = c.partyEnemy(h.id)!;
    expect(army.heroes.length).toBe(h.size);
    expect(army.doctrine).toBe('hammer');
    expect(army.holdField).toBe(true);
    const t = army.heroes[0];
    expect(isCaptain(t)).toBe(true);
    expect(t.name).toBe('The Tyrant');
    expect(t.level).toBe(HOST.tyrantLevel);
    expect(t.equip.weapon!.rarity).toBe('legendary');
    expect(new Set(army.heroes.map((x) => x.culture)).size).toBe(2);
    expect(partyArmy(h, { nextId: 1 }).heroes.map((x) => x.name)).toEqual(partyArmy(h, { nextId: 1 }).heroes.map((x) => x.name));
    expect(c.canSurrender(h.id)).toBe(false);
  });
});

describe('the march and the sack (R5.2, R5.3)', () => {
  it('marches on the starting town, sacks it for SACK_DAYS, turns home and comes back', () => {
    const c = musterAll();
    const w = c.world;
    const start = w.map.settlements[w.map.start];
    w.s.inside = w.map.start; // the party waits in town: no contact
    const h = () => w.host!;
    const d0 = Math.hypot(h().x - start.x, h().y - start.y);
    let t = 0;
    while (!w.isSacked(w.map.start) && t < 400) {
      w.advance(1, PLAYER, true);
      t++;
    }
    expect(t).toBeLessThan(400);
    expect(d0 / t).toBeGreaterThan(1); // tiles an hour: about HOST.speed x a band's pace
    expect(w.isClosed(w.map.start)).toBe(true);
    expect(w.recruits(w.map.start, c.data.heroes)).toEqual([]);
    expect(w.wares(w.map.start)).toEqual([]);
    expect(w.s.arc.sackedUntil).toBeGreaterThan(w.s.time + SACK_DAYS * 24 - 1.01);
    expect(w.s.arc.sackedUntil).toBeLessThanOrEqual(w.s.time + SACK_DAYS * 24);
    expect(w.s.arc.stage).toBe('host');
    const home = w.map.settlements[h().home];
    expect([h().tx, h().ty]).toEqual([home.x, home.y]);
    const until = w.s.arc.sackedUntil!;
    let back = false;
    while (w.s.time < until) {
      w.advance(1, PLAYER, true);
      expect(w.s.arc.sackedUntil).toBe(until); // a burning town isn't sacked again
      if (h().tx === w.map.settlements[w.map.start].x && h().ty === w.map.settlements[w.map.start].y) back = true;
    }
    expect(back).toBe(true);
    if (w.s.arc.sackedUntil === until) expect(w.isSacked(w.map.start)).toBe(false);
  });
});

describe('beating the host (R5.4, R5.5, R6)', () => {
  it('a defeat leaves it marching, weakened by its dead', () => {
    const c = musterAll();
    const h = c.world.host!;
    const size = h.size;
    c.afterPartyBattle(h.id, outcome(false, 4));
    expect(c.world.s.arc.stage).toBe('host');
    expect(c.world.host!.size).toBe(size - 4);
    c.afterPartyBattle(h.id, outcome(false, 999));
    expect(c.world.host!.size).toBe(1);
  });

  it("victory: arc 'won', the host is gone, a legendary piece of the campaign's set first in the loot as an extra pick", () => {
    const c = musterAll();
    const h = c.world.host!;
    const out = { ...outcome(true, h.size), loot: c.data.stash.slice(0, 2) };
    c.afterPartyBattle(h.id, out);
    expect(c.world.s.arc.stage).toBe('won');
    expect(c.world.host).toBeNull();
    expect(c.world.s.parties.some((p) => p.kind === 'host')).toBe(false);
    expect(out.loot[0].rarity).toBe('legendary');
    expect(itemDef(out.loot[0].def).set).toBe(arcSet(c.world.s.seed));
    expect(out.picks).toBe(3);
    c.continueArc();
    expect(c.world.s.arc.stage).toBe('post');
  });

  it('a host that broke and ran still counts as beaten (no retreat outcome for it)', () => {
    const c = musterAll();
    const h = c.world.host!;
    const out = outcome(true, 5);
    c.afterPartyBattle(h.id, out, { winner: 0, retreated: 1, units: [] } as never);
    expect(c.world.s.arc.stage).toBe('won');
  });
});

describe('the post-game (R5.4, R6)', () => {
  function won(seed = 5): Campaign {
    const c = musterAll(seed);
    c.afterPartyBattle(c.world.host!.id, outcome(true, 20));
    c.world.s.inside = c.world.map.start; // waiting in town: no band contact stops the clock
    return c;
  }

  it('danger rises by 0.2 (at most 1); lairs stay burnt until the reborn spots rise after 10 days', () => {
    const c = won();
    const w = c.world;
    const st = w.map.settlements[w.map.start];
    expect(w.danger(st.x, st.y)).toBeCloseTo(Math.min(1, dangerAt(w.map, st.x, st.y) + POST_GAME.danger));
    const spots = w.rebornSpots();
    expect(spots.length).toBe(POST_GAME.reborn);
    w.advance(POST_GAME.rebornDays * 24 - 2, PLAYER, true);
    expect(w.lairsFallen).toBe(ARC_LAIRS);
    w.advance(3, PLAYER, true);
    for (const id of spots) {
      expect(w.lairFallen(id)).toBe(false);
      expect(w.isReborn(id)).toBe(true);
      expect(w.garrisonSize(id)).toBe(w.garrisonFull(id));
    }
    expect(w.lairsFallen).toBe(ARC_LAIRS - POST_GAME.reborn);
    expect(w.s.arc.stage).toBe('won');
  });

  it('a reborn lair drops only a missing set piece, no hoard and no pity, and rises again 10 days later', () => {
    const c = won();
    const w = c.world;
    w.advance(POST_GAME.rebornDays * 24 + 1, PLAYER, true);
    const id = w.rebornSpots()[0];
    const pity = c.data.pity ?? 0;
    const out = outcome(true, 12);
    const spoils = c.afterLairAssault(id, out);
    expect(spoils.fallen).toBe(true);
    expect(spoils.hoard.length).toBe(1);
    expect(spoils.hoard[0].rarity).toBe('legendary');
    expect(itemDef(spoils.hoard[0].def).set).toBe(arcSet(w.s.seed));
    expect(c.data.pity ?? 0).toBe(pity);
    expect(w.s.arc.stage).toBe('won');
    w.advance(POST_GAME.rebornDays * 24 - 2, PLAYER, true);
    expect(w.lairFallen(id)).toBe(true);
    w.advance(3, PLAYER, true);
    expect(w.lairFallen(id)).toBe(false);
  });

  it('once all five pieces are owned, a reborn lair drops nothing', () => {
    const c = won();
    const w = c.world;
    w.advance(POST_GAME.rebornDays * 24 + 1, PLAYER, true);
    for (const def of setPieces(arcSet(w.s.seed))) c.data.stash.push({ uid: `x${def}`, def, rarity: 'legendary', cond: 100 });
    expect(c.afterLairAssault(w.rebornSpots()[1], outcome(true, 12)).hoard).toEqual([]);
  });

  it('nothing post-game changes a world before the win (danger is the map\'s)', () => {
    const c = Campaign.fresh(9);
    const st = c.world.map.settlements[3];
    expect(c.world.danger(st.x, st.y)).toBe(dangerAt(c.world.map, st.x, st.y));
    expect(c.world.postGame).toBe(false);
  });
});

describe('saves (G-SAVE): live saves reach the host, and none is stuck or skips the end', () => {
  it('the v6 fixture loads at stage lairs with no host; razing its six lairs musters the host', () => {
    const c = new Campaign(deserialize(fixture('v6-'))!);
    c.world.deck = [];
    expect(c.world.s.arc.stage).toBe('lairs');
    expect(c.world.host).toBeNull();
    for (const st of lairs(c)) c.razeLair(st.id);
    expect(c.world.s.arc.stage).toBe('host');
    expect(c.world.host).not.toBeNull();
  });

  it('older saves (v5, v4) migrate and load at stage lairs', () => {
    for (const tag of ['v5-played', 'v4-']) {
      const c = new Campaign(deserialize(fixture(tag))!);
      expect(c.world.s.arc.stage).toBe('lairs');
      expect(c.world.host).toBeNull();
    }
  });

  it('a save past the threshold (every lair fallen, arc still at lairs) musters the host on load', () => {
    const c = Campaign.fresh(5);
    for (const st of lairs(c)) c.world.s.lairs[st.id] = { fallen: true, lost: 10, lostAt: 100 };
    c.world.s.time = 24 * 120;
    const back = new Campaign(deserialize(serialize(c.sync()))!);
    expect(back.world.s.arc.stage).toBe('host');
    expect(back.world.host!.kind).toBe('host');
  });

  it("a save at stage 'host' with no host on the map musters it again; one with a host keeps it", () => {
    const c = Campaign.fresh(5);
    c.world.s.arc = { stage: 'host', hostParty: 7 };
    const back = new Campaign(deserialize(serialize(c.sync()))!);
    const h = back.world.host!;
    expect(h).not.toBeNull();
    expect(back.world.s.arc.hostParty).toBe(h.id);
    const again = new Campaign(deserialize(serialize(back.sync()))!);
    expect(again.world.host).toEqual(h);
    expect(again.world.s.parties.filter((p) => p.kind === 'host').length).toBe(1);
  });

  it('a host on the march and a won arc survive a save round trip', () => {
    const c = musterAll();
    c.world.s.inside = c.world.map.start;
    c.world.advance(6, PLAYER, true);
    const h = { ...c.world.host! };
    const back = new Campaign(deserialize(serialize(c.sync()))!);
    expect(back.world.host).toEqual(h);
    back.afterPartyBattle(h.id, outcome(true, h.size));
    const done = new Campaign(deserialize(serialize(back.sync()))!);
    expect(done.world.s.arc.stage).toBe('won');
    expect(done.world.host).toBeNull();
  });

  it('a won save does not muster again on load', () => {
    const c = musterAll();
    c.afterPartyBattle(c.world.host!.id, outcome(true, 20));
    const back = new Campaign(deserialize(serialize(c.sync()))!);
    expect(back.world.s.arc.stage).toBe('won');
    expect(back.world.host).toBeNull();
  });

  it('mustering draws nothing from the world Rng, so the world\'s bands go on as they would have', () => {
    const c = nearEnd();
    const before = c.world.rng.state;
    c.razeLair(lairs(c)[ARC_LAIRS - 1].id);
    expect(c.world.rng.state).toBe(before);
  });
});
