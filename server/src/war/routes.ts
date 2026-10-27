/**
 * War roster API (/api/war/*, M5e): the player's persistent soldiers (./persons.ts). Signed in and playable like the
 * online routes; bodies zod-checked.
 *
 *   GET  /roster                      persons, caps, home strongroom (stock, items), captives held, upkeep
 *                                      (W-60: no recruiting or training; men join by claiming souls in a region)
 *   POST /persons/:id/equip { slot, uid|null } put on a strongroom item, or take one off
 *   POST /persons/:id/level { attrs?, skill? } spend points, take a skill at levels 3 / 7
 *   POST /squad         { ids }                the squad order of his fit men at home (<= ARMY_MAX)
 *   POST /persons/:id/promote { cls }        promote to an elite of his family (30 min, the elite rare kit's coin)
 *   POST /persons/:id/ransom                  pay a captive's ransom (coin to his captor's strongroom): he comes home
 *   POST /persons/:id/retire { civ? }         retire (half his gear's value back in coin); level 10: into a civilian class
 *   GET  /treasury                            the alliance's (clan's) strongbox coin, the player's role, the latest audit log
 *   POST /treasury/deposit { amount }         a member puts coin of his home strongroom into the strongbox
 *   POST /treasury/ransom/:id                 the leader or an officer pays a member's captive's ransom from the pool
 *   POST /captives/:id/release                the captor lets a captive he holds go
 *   POST /persons/:id/node  { node }          M5h4: a civilian takes a profession node
 *   POST /persons/:id/respec                  M5h4: his nodes reset (50 coin, once a day)
 *   GET  /stash                               M6e: where his things are: items D1 keeps with their place (holder id) or
 *                                             the region whose workplace holds them, and the holders of the region rooms
 *                                             (chests, carts, packs) as saved; equip from the strongroom with
 *                                             /persons/:id/equip; repair and salvage go over the region socket (`mend`)
 *   /start/*                                  a new player's start: alliance, home region, squad (./start.ts)
 *   GET  /works                               W-61: his alliance's works (progress, needs, contributors; ./works.ts)
 *   POST /works/:id/give { goods }            give goods from his home strongroom to one (at most what it lacks)
 *   GET  /titles                              the season's titles (./peace.ts) and his own season stats
 *   GET  /settlements?region=                 W-63: settlements of a region, or of the world (./settlements.ts)
 *   GET  /settlements/inbox                   requests and offers to settlements he rules, his own, his truces
 *   GET  /settlements/:id                     a settlement and its members
 *   POST /settlements/:id/settle              ask its lord for a plot
 *   POST /settlements/:id/terms { kind, from?, tribute? }  vassal (his settlement `from` overlord) or join; his men
 *                                             must stand on its ground (PRESENCE, the room's check)
 *   POST /settlements/:id/garrison { from }   an overlord's lord asks to garrison his vassal
 *   POST /settlements/:id/truce { from, bond } a truce between his settlement `from` and this one, bond escrowed
 *   POST /settlements/:id/rebel               a vassal's lord ends the tie
 *   POST /settlements/offers/:id/accept { plot? } the asked lord accepts (a settle request: with the plot)
 *   POST /settlements/offers/:id/refuse       the asked lord refuses, or the offerer withdraws
 *   GET  /tasks                               W-62 E7: his daily and weekly tasks (drawn on first read), progress, rerolls
 *   POST /tasks/:kind/:slot/claim             claim a done task: reward into his strongroom, score to his alliance
 *   POST /tasks/:kind/:slot/reroll            reroll a task not yet claimed (one free a UTC day; ./tasks.ts)
 *   GET  /favour                              W-66: his divine favour (level, title, bonus, what earned it lately; ./favour.ts)
 *   GET  /crown                               W-64: his alliance's crown, council, treasury, election, petition,
 *                                             orders, pacts and chronicle (./crown.ts; the clock moves on the read)
 *   POST /crown/vote { candidate }            vote in the running election
 *   POST /crown/petition                      sign the no-confidence petition (opening one)
 *   POST /crown/confidence { yes }            vote in the open no-confidence vote
 *   POST /crown/appoint { office, pid|null }  the monarch appoints or dismisses
 *   POST /crown/tax { pct }                   the Treasurer sets the alliance tax
 *   POST /crown/deposit { coin }              coin of his strongroom into the treasury
 *   POST /crown/works/:id { goods }           the Treasurer gives treasury goods to a work
 *   POST /crown/contracts/:id { coin }        the Treasurer tops up a taken build or guard contract
 *   POST /crown/orders { kind, region, ... }  the Marshal or the Quartermaster posts an order (bounty from the treasury)
 *   POST /crown/orders/:id/end                its office ends it (a war goal pays out)
 *   POST /crown/orders/:id/deliver { n }      deliver to a supply quest from his sites in its town
 *   POST /crown/pacts { to, kind }            the Envoy offers a pact or a truce
 *   POST /crown/pacts/:id/:act                accept, refuse, cancel or end one
 *   POST /dev/seed      { squad? }             DEV_AUTH=1 only: a whole army (and civilians) to test with
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { readJson } from '../body';
import type { AppEnv } from '../env';
import { ApiError, badRequest } from '../errors';
import { db, requirePlayable } from '../middleware';
import { SLOTS } from '../../../src/data/items';
import { ATTR_IDS, ATTR_MAX } from '../../../src/data/perks';
import { SKILLS } from '../../../src/war/sim/skills';
import { ARMY_MAX } from '../../../src/war/sim/soldiers';
import type { WarSkillId } from '../../../src/war/types';
import { pickNode, respec, stash } from './crafting';
import { deposit, payRansomFromTreasury, treasury } from './treasury';
import { trade } from './tradeRoutes';
import { start } from './start';
import { give, worksOf } from './works';
import { claimTask, rerollOne, tasksOf } from './tasks';
import { getFavour } from './favour';
import { statsOf, titles } from './peace';
import { allianceOf } from './world/members';
import { stagesOf } from '../../../src/war/net/works';
import { GOODS } from '../../../src/war/net/protocol';
import { accept, inbox, offerGarrison, offerTerms, offerTruce, PRESENCE, rebel, refuse, requestSettle, settlement, settlementsOf, settlementView, SETTLE } from './settlements';
import { WAR_REGIONS } from './regions';
import { answerPact, appoint, confidence, crownView, deliver, deposit as crownDeposit, endOrder, fundContract, fundWork, offerPact, postOrder, setTax, sign, vote } from './crown';
import { CROWN, OFFICES, type Office } from '../../../src/war/net/crown';
import { equip, formSquad, levelUp, payRansom, promote, releaseCaptive, retire, roster, seed } from './persons';

export const war = new Hono<AppEnv>();
// per route, not war.use('/*'): /api/war/:region/stats (dev, index.ts) shares the prefix

const MAX_BODY = 2048;
const personId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const idParam = (s: string) => {
  if (!personId.safeParse(s).success) throw badRequest('Bad soldier id');
  return s;
};
const skillId = z.string().refine((s): s is WarSkillId => s in SKILLS, 'unknown skill');
const group = z.array(z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/), level: z.number().int().min(1).max(10).optional() })).max(2 * ARMY_MAX); // fighters (seed checks ARMY_MAX) and civilians

war.get('/roster', requirePlayable, async (c) => c.json(await roster(db(c.env), c.get('session').pid, Date.now())));

war.post('/persons/:id/equip', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ slot: z.enum(SLOTS as [string, ...string[]]), uid: z.string().min(1).max(120).nullable() }), MAX_BODY);
  await equip(db(c.env), c.get('session').pid, id, b.slot as (typeof SLOTS)[number], b.uid, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/level', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const attrs = z.object(Object.fromEntries(ATTR_IDS.map((k) => [k, z.number().int().min(0).max(ATTR_MAX).optional()]))).strict();
  const b = await readJson(c, z.object({ attrs: attrs.optional(), skill: skillId.optional() }), MAX_BODY);
  await levelUp(db(c.env), c.get('session').pid, id, b.attrs ?? {}, b.skill as WarSkillId | undefined, Date.now());
  return c.json({ ok: true });
});

war.post('/squad', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ ids: z.array(personId).max(ARMY_MAX) }), MAX_BODY);
  await formSquad(db(c.env), c.get('session').pid, b.ids, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/promote', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ cls: z.string().regex(/^[a-z_]{1,24}$/) }), MAX_BODY);
  return c.json({ until: await promote(db(c.env), c.get('session').pid, id, b.cls, Date.now()) });
});

war.post('/persons/:id/ransom', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ paid: await payRansom(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.post('/persons/:id/retire', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ civ: z.string().regex(/^[a-z_]{1,24}$/).optional() }), MAX_BODY);
  return c.json({ refund: await retire(db(c.env), c.get('session').pid, id, b.civ, Date.now()) });
});

war.get('/treasury', requirePlayable, async (c) => c.json(await treasury(db(c.env), c.get('session').pid, Date.now())));

war.post('/treasury/deposit', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ amount: z.number().int().min(1).max(1_000_000) }), MAX_BODY);
  return c.json({ coin: await deposit(db(c.env), c.get('session').pid, b.amount, Date.now()) });
});

war.post('/treasury/ransom/:id', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ paid: await payRansomFromTreasury(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.post('/captives/:id/release', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  await releaseCaptive(db(c.env), c.get('session').pid, id, Date.now());
  return c.json({ ok: true });
});

war.post('/persons/:id/node', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  const b = await readJson(c, z.object({ node: z.string().regex(/^[A-Za-z0-9_]{1,40}$/) }), MAX_BODY);
  return c.json({ perks: await pickNode(db(c.env), c.get('session').pid, id, b.node, Date.now()) });
});

war.post('/persons/:id/respec', requirePlayable, async (c) => {
  const id = idParam(c.req.param('id'));
  return c.json({ next: await respec(db(c.env), c.get('session').pid, id, Date.now()) });
});

war.get('/stash', requirePlayable, async (c) => c.json(await stash(db(c.env), c.get('session').pid)));

war.get('/works', requirePlayable, async (c) => {
  const d = db(c.env), a = await allianceOf(d, c.get('session').pid);
  return c.json({ alliance: a, works: a === null ? [] : await worksOf(d, a) });
});

war.post('/works/:id/give', requirePlayable, async (c) => {
  const id = c.req.param('id');
  if (!stagesOf(id)) throw badRequest('Bad work');
  const b = await readJson(c, z.object({ goods: z.partialRecord(z.enum(GOODS as unknown as [string, ...string[]]), z.number().positive().max(100_000)) }), MAX_BODY);
  return c.json({ given: await give(c.env, c.get('session').pid, id, b.goods as Record<string, number>, Date.now()) });
});

war.get('/titles', requirePlayable, async (c) => {
  const d = db(c.env);
  return c.json({ titles: await titles(d), mine: await statsOf(d, c.get('session').pid) });
});

const sid = (s: string) => {
  if (!/^\d{1,10}$/.test(s)) throw badRequest('Bad settlement id');
  return Number(s);
};
const num = z.number().int().min(0).max(1_000_000_000);

war.get('/settlements', requirePlayable, async (c) => {
  const region = c.req.query('region');
  if (region !== undefined && !WAR_REGIONS.includes(region)) throw badRequest('Bad region');
  return c.json({ settlements: await settlementsOf(db(c.env), region) });
});

war.get('/settlements/inbox', requirePlayable, async (c) => c.json(await inbox(db(c.env), c.get('session').pid, Date.now())));

war.get('/settlements/:id', requirePlayable, async (c) => c.json(await settlementView(db(c.env), sid(c.req.param('id')))));

war.post('/settlements/:id/settle', requirePlayable, async (c) => c.json({ offer: await requestSettle(db(c.env), c.get('session').pid, sid(c.req.param('id')), Date.now()) }));

war.post('/settlements/:id/terms', requirePlayable, async (c) => {
  const id = sid(c.req.param('id')), pid = c.get('session').pid, d = db(c.env);
  const b = await readJson(c, z.object({ kind: z.enum(['vassal', 'join']), from: num.optional(), tribute: z.number().int().min(0).max(SETTLE.tributeMax).optional() }), MAX_BODY);
  const present = await PRESENCE.check(pid, await settlement(d, id));
  return c.json({ offer: await offerTerms(d, pid, b.kind, id, b.from ?? null, b.tribute ?? 0, present, Date.now()) });
});

war.post('/settlements/:id/garrison', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ from: num }), MAX_BODY);
  return c.json({ offer: await offerGarrison(db(c.env), c.get('session').pid, b.from, sid(c.req.param('id')), Date.now()) });
});

war.post('/settlements/:id/truce', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ from: num, bond: z.number().int().min(1).max(SETTLE.bondMax) }), MAX_BODY);
  return c.json({ offer: await offerTruce(db(c.env), c.get('session').pid, b.from, sid(c.req.param('id')), b.bond, Date.now()) });
});

war.post('/settlements/:id/rebel', requirePlayable, async (c) => c.json({ overlord: await rebel(db(c.env), c.get('session').pid, sid(c.req.param('id')), Date.now()) }));

war.post('/settlements/offers/:id/accept', requirePlayable, async (c) => {
  const tile = z.number().int().min(0).max(4096);
  const b = await readJson(c, z.object({ plot: z.object({ x0: tile, y0: tile, x1: tile, y1: tile }).optional() }), MAX_BODY);
  return c.json({ state: await accept(db(c.env), c.get('session').pid, sid(c.req.param('id')), b.plot ?? null, Date.now()) });
});

war.post('/settlements/offers/:id/refuse', requirePlayable, async (c) => c.json({ state: await refuse(db(c.env), c.get('session').pid, sid(c.req.param('id')), Date.now()) }));

war.get('/favour', requirePlayable, async (c) => c.json(await getFavour(c.env, c.get('session').pid)));

war.get('/tasks', requirePlayable, async (c) => c.json(await tasksOf(db(c.env), c.get('session').pid, Date.now())));

const taskParams = (kind: string, slot: string) => {
  const k = z.enum(['daily', 'weekly']).safeParse(kind), s = z.coerce.number().int().min(0).max(4).safeParse(slot);
  if (!k.success || !s.success) throw badRequest('Bad task');
  return { kind: k.data, slot: s.data };
};
war.post('/tasks/:kind/:slot/claim', requirePlayable, async (c) => {
  const t = taskParams(c.req.param('kind'), c.req.param('slot'));
  return c.json(await claimTask(c.env, c.get('session').pid, t.kind, t.slot, Date.now()));
});
war.post('/tasks/:kind/:slot/reroll', requirePlayable, async (c) => {
  const t = taskParams(c.req.param('kind'), c.req.param('slot'));
  return c.json({ task: await rerollOne(db(c.env), c.get('session').pid, t.kind, t.slot, Date.now()) });
});

const intId = (s: string) => {
  if (!/^\d{1,10}$/.test(s)) throw badRequest('Bad id');
  return Number(s);
};
const pidNum = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
war.get('/crown', requirePlayable, async (c) => c.json(await crownView(c.env, c.get('session').pid, Date.now())));
war.post('/crown/vote', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ candidate: pidNum }), MAX_BODY);
  await vote(c.env, c.get('session').pid, b.candidate, Date.now());
  return c.json({ ok: true });
});
war.post('/crown/petition', requirePlayable, async (c) => c.json(await sign(c.env, c.get('session').pid, Date.now())));
war.post('/crown/confidence', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ yes: z.boolean() }), MAX_BODY);
  await confidence(c.env, c.get('session').pid, b.yes, Date.now());
  return c.json({ ok: true });
});
war.post('/crown/appoint', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ office: z.enum(OFFICES.map((o) => o.id) as [Office, ...Office[]]), pid: pidNum.nullable() }), MAX_BODY);
  await appoint(c.env, c.get('session').pid, b.office, b.pid, Date.now());
  return c.json({ ok: true });
});
war.post('/crown/tax', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ pct: z.number().int().min(0).max(CROWN.taxMax) }), MAX_BODY);
  return c.json({ pct: await setTax(c.env, c.get('session').pid, b.pct, Date.now()) });
});
war.post('/crown/deposit', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ coin: z.number().positive().max(1_000_000) }), MAX_BODY);
  return c.json({ coin: await crownDeposit(c.env, c.get('session').pid, b.coin, Date.now()) });
});
war.post('/crown/works/:id', requirePlayable, async (c) => {
  const id = c.req.param('id');
  if (!stagesOf(id)) throw badRequest('Bad work');
  const b = await readJson(c, z.object({ goods: z.partialRecord(z.enum(GOODS as unknown as [string, ...string[]]), z.number().positive().max(100_000)) }), MAX_BODY);
  return c.json({ given: await fundWork(c.env, c.get('session').pid, id, b.goods as Record<string, number>, Date.now()) });
});
war.post('/crown/contracts/:id', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ coin: z.number().positive().max(CROWN.bountyMax) }), MAX_BODY);
  return c.json({ coin: await fundContract(c.env, c.get('session').pid, intId(c.req.param('id')), b.coin, Date.now()) });
});
war.post('/crown/orders', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({
    kind: z.enum(['attack', 'defend', 'rally', 'supply']), region: z.string().max(40), target: z.string().max(40).optional(),
    x: z.number().int().min(0).max(4096).optional(), y: z.number().int().min(0).max(4096).optional(),
    res: z.enum(GOODS as unknown as [string, ...string[]]).optional(), n: z.number().positive().max(100_000).optional(),
    bounty: z.number().min(0).max(CROWN.bountyMax), hours: z.number().int().min(1).max(CROWN.orderHoursMax),
  }), MAX_BODY);
  return c.json({ id: await postOrder(c.env, c.get('session').pid, b, Date.now()) });
});
war.post('/crown/orders/:id/end', requirePlayable, async (c) => c.json(await endOrder(c.env, c.get('session').pid, intId(c.req.param('id')), Date.now())));
war.post('/crown/orders/:id/deliver', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ n: z.number().positive().max(100_000) }), MAX_BODY);
  return c.json(await deliver(c.env, c.get('session').pid, intId(c.req.param('id')), b.n, Date.now()));
});
war.post('/crown/pacts', requirePlayable, async (c) => {
  const b = await readJson(c, z.object({ to: z.number().int().min(0).max(3), kind: z.enum(['pact', 'truce']) }), MAX_BODY);
  return c.json({ id: await offerPact(c.env, c.get('session').pid, b.to, b.kind, Date.now()) });
});
war.post('/crown/pacts/:id/:act', requirePlayable, async (c) => {
  const act = z.enum(['accept', 'refuse', 'cancel', 'end']).safeParse(c.req.param('act'));
  if (!act.success) throw badRequest('Bad act');
  return c.json({ state: await answerPact(c.env, c.get('session').pid, intId(c.req.param('id')), act.data, Date.now()) });
});

war.route('/trade', trade);
war.route('/start', start);

war.post('/dev/seed', requirePlayable, async (c) => {
  if (c.env.DEV_AUTH !== '1') throw new ApiError(404, 'not_found', 'No such endpoint');
  const b = await readJson(c, z.object({ squad: group.optional() }), MAX_BODY * 2);
  const ids = await seed(db(c.env), c.get('session').pid, Date.now(), b);
  return c.json({ ids });
});
