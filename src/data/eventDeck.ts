/**
 * The starter event deck (EV-02; design/gdd/campaign-events.md R5, R6): 24
 * overland events built only from the closed effect vocabulary of
 * src/data/events.ts. Card text lives in src/i18n/events.en.ts and
 * events.ru.ts under `event.<id>.*` keys (no text here).
 *
 * SHIPPED OFF (V5-064, V5-070). An open event pauses the world map, and the
 * event card that resolves it is EV-03's. Until that card merges,
 * EVENT_DECK_ENABLED stays false and liveDeck() is empty, so live players see
 * no event and the world runs exactly as before. EV-03 flips the flag and
 * points World.deck at liveDeck() (from src/world/world.ts, not from
 * events.ts: this module imports events.ts, so the reverse import would be a
 * cycle).
 *
 * Chains (R5: at least a third of the deck sets a flag a later event reads):
 * deserters -> deserters_hunt, shrine_ares / battlefield_spoils -> ares_wrath,
 * caravan -> caravan_raid, wounded_foe -> officer_repays,
 * thieves -> thief_relapse, harvest -> village_warning,
 * bandit_scouts -> bandits_vengeance. Every follow-up clears its flag, so a
 * chain fires once per setting. `host_musters` is set by the arc
 * (campaign-arc.md R5), not by an event.
 */
import { fx, type EventDef } from './events';

/** The deck is live only when this is true. EV-03 (the event card) sets it (V5-070). */
export const EVENT_DECK_ENABLED = false;

/**
 * The oracle's paid choice is a free perk retrain (abilities.md R7), spent at
 * a drillmaster (Campaign.useFreeRetrain). No screen spends it yet (SET-01),
 * so the oracle's weight is 0 until this is true: a card must not sell what
 * the game can't deliver.
 */
export const RETRAIN_SPENDABLE = false;

/** One spawned-band fight the deck sends after the player: a mercenary captain with a fat bounty (rival_challenge, deserters_hunt). */
const CAPTAIN_HUNT = { captain: true, hunts: true, bountyMult: 2 } as const;

export const STARTER_DECK: readonly EventDef[] = [
  // ------------------------------------------------------------- march
  {
    id: 'deserters', trigger: 'march', weight: 3, cond: { minDay: 2, notFlags: ['deserters_joined'] }, cooldownDays: 8,
    choices: [
      { key: 'take', effects: [fx.recruit('raw', 1, 2), fx.setFlag('deserters_joined')] },
      { key: 'away', effects: [] },
      { key: 'rob', effects: [fx.gold(30)], chance: { p: 0.6, fail: [fx.wound('one_random', 24)] } },
    ],
  },
  {
    id: 'shrine_ares', trigger: 'march', weight: 2, cond: { notFlags: ['ares_angry'] }, cooldownDays: 8,
    choices: [
      { key: 'offer', cost: [fx.gold(-30)], effects: [fx.nextBattle('xp')] },
      { key: 'pass', effects: [] },
      { key: 'loot', effects: [fx.gold(40), fx.setFlag('ares_angry')] },
    ],
  },
  {
    id: 'rival_challenge', trigger: 'march', weight: 1, cond: { minDay: 6 }, cooldownDays: 12,
    choices: [
      { key: 'accept', effects: [fx.spawnBand('mercs', CAPTAIN_HUNT)] },
      { key: 'refuse', effects: [fx.priceMod('here', 10, 5)] },
    ],
  },
  {
    // ai-doctrines.md R8: some band on the map has escaped the player. The
    // vocabulary can't name that band, so a fresh captain's band hunts instead.
    id: 'rival_returns', trigger: 'march', weight: 2, cond: { escaped: 1 }, cooldownDays: 8,
    choices: [
      { key: 'fight', effects: [fx.spawnBand('mercs', { captain: true, hunts: true })] },
      { key: 'evade', effects: [], chance: { p: 0.5, fail: [fx.spawnBand('mercs', { captain: true, hunts: true })] } },
    ],
  },
  {
    // The GDD's "near a river" has no condition in the engine (EV-01.md); the text says "crossing".
    id: 'ford_toll', trigger: 'march', weight: 2, cond: {}, cooldownDays: 6,
    choices: [
      { key: 'pay', cost: [fx.gold(-15)], effects: [] },
      { key: 'force', effects: [fx.spawnBand('bandits', { size: 0.8, hunts: true })] },
    ],
  },
  {
    id: 'bandit_scouts', trigger: 'march', weight: 2, cond: { notFlags: ['scouts_taken'] }, cooldownDays: 8,
    choices: [
      { key: 'question', effects: [fx.gold(20), fx.reveal('nearest'), fx.setFlag('scouts_taken')] },
      { key: 'release', effects: [] },
    ],
  },

  // ------------------------------------------------------------- arrivals
  {
    id: 'plague_town', trigger: 'arrive_town', weight: 2, cond: {}, cooldownDays: 10,
    choices: [
      { key: 'leave', effects: [] },
      { key: 'help', cost: [fx.food(-20)], effects: [fx.xp('all', 15)], chance: { p: 0.7, fail: [fx.xp('all', 15), fx.wound('one_random', 36)] } },
      { key: 'pay', cost: [fx.gold(-50)], effects: [fx.priceMod('here', -10, 5)] },
    ],
  },
  {
    id: 'caravan', trigger: 'arrive_town', weight: 2, cond: { minDay: 3, notFlags: ['caravan_escort'] }, cooldownDays: 8,
    choices: [
      { key: 'escort', effects: [fx.gold(80), fx.item('uncommon'), fx.setFlag('caravan_escort')] },
      { key: 'decline', effects: [] },
    ],
  },
  {
    id: 'oracle', trigger: 'arrive_village', weight: RETRAIN_SPENDABLE ? 2 : 0, cond: {}, unique: true, cooldownDays: 0,
    choices: [
      { key: 'pay', cost: [fx.gold(-40)], effects: [fx.retrain()] },
      { key: 'ask', effects: [fx.reveal('nearest')] },
    ],
  },
  {
    id: 'harvest', trigger: 'arrive_village', weight: 2, cond: { notFlags: ['village_friend'] }, cooldownDays: 4,
    choices: [
      { key: 'buy', cost: [fx.gold(-20)], effects: [fx.food(30)] },
      {
        key: 'reap', effects: [fx.food(15), fx.setFlag('village_friend')],
        chance: { p: 0.75, fail: [fx.food(15), fx.setFlag('village_friend'), fx.wound('one_random', 12)] },
      },
      { key: 'move', effects: [] },
    ],
  },

  // ------------------------------------------------------------- camp
  {
    // The garrison cut is read by lair assaults (campaign-arc.md R2, AR-02); the card only promises the map.
    id: 'deserter_map', trigger: 'camp', weight: 2, cond: { arcStage: ['lairs'] }, cooldownDays: 10,
    choices: [
      { key: 'buy', cost: [fx.gold(-25)], effects: [fx.reveal('nearest'), fx.weakenGarrison('nearest', 3)] },
      { key: 'refuse', effects: [] },
    ],
  },
  {
    id: 'camp_fever', trigger: 'camp', weight: 2, cond: {}, cooldownDays: 8,
    choices: [
      { key: 'stores', cost: [fx.food(-20)], effects: [fx.heal()] },
      { key: 'herbs', cost: [fx.gold(-30)], effects: [fx.heal()] },
      { key: 'march', effects: [fx.wound('one_random', 24)] },
    ],
  },
  {
    id: 'thieves', trigger: 'camp', weight: 2, cond: { notFlags: ['thief_pressed'] }, cooldownDays: 10,
    choices: [
      { key: 'press', effects: [fx.recruit('raw', 1, 1), fx.setFlag('thief_pressed')] },
      { key: 'drive', effects: [] },
    ],
  },

  // ------------------------------------------------------------- after a won battle
  {
    id: 'wounded_foe', trigger: 'after_battle', weight: 2, cond: { notFlags: ['spared_officer'] }, cooldownDays: 6,
    choices: [
      { key: 'ransom', effects: [fx.gold(35)] },
      { key: 'spare', effects: [fx.setFlag('spared_officer')] },
    ],
  },
  {
    id: 'battlefield_spoils', trigger: 'after_battle', weight: 2, cond: { notFlags: ['ares_angry'] }, cooldownDays: 4,
    choices: [
      { key: 'strip', effects: [fx.gold(30), fx.setFlag('ares_angry')] },
      { key: 'rites', cost: [fx.food(-10)], effects: [fx.xp('all', 10)] },
      { key: 'move', effects: [] },
    ],
  },
  {
    id: 'mercenary_offer', trigger: 'after_battle', weight: 2, cond: {}, cooldownDays: 6,
    choices: [
      { key: 'hire', cost: [fx.gold(-45)], effects: [fx.recruit('raw', 2, 1)] },
      { key: 'refuse', effects: [] },
    ],
  },

  // ------------------------------------------------------------- follow-ups (flag)
  {
    // GDD R6 "hand them over" would need an effect that removes men, which the vocabulary lacks: he takes silver instead.
    id: 'deserters_hunt', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'deserters_joined', days: [4, 8] },
    choices: [
      { key: 'fight', effects: [fx.spawnBand('mercs', CAPTAIN_HUNT), fx.clearFlag('deserters_joined')] },
      { key: 'pay', cost: [fx.gold(-60)], effects: [fx.clearFlag('deserters_joined')] },
    ],
  },
  {
    id: 'ares_wrath', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'ares_angry', days: [3, 6] },
    choices: [
      { key: 'amends', cost: [fx.gold(-60)], effects: [fx.clearFlag('ares_angry')] },
      { key: 'bear', effects: [fx.wound('one_random', 24), fx.wound('one_random', 24), fx.clearFlag('ares_angry')] },
    ],
  },
  {
    id: 'caravan_raid', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'caravan_escort', days: [1, 2] },
    choices: [
      { key: 'fight', effects: [fx.spawnBand('raiders', { hunts: true }), fx.clearFlag('caravan_escort')] },
      { key: 'pay', cost: [fx.gold(-50)], effects: [fx.clearFlag('caravan_escort')] },
    ],
  },
  {
    id: 'officer_repays', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'spared_officer', days: [4, 9] },
    choices: [
      { key: 'gift', effects: [fx.item('uncommon'), fx.clearFlag('spared_officer')] },
      { key: 'word', effects: [fx.reveal('nearest'), fx.nextBattle('pick'), fx.clearFlag('spared_officer')] },
    ],
  },
  {
    id: 'thief_relapse', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'thief_pressed', days: [3, 6] },
    choices: [
      { key: 'flog', effects: [fx.wound('lowest', 24), fx.clearFlag('thief_pressed')] },
      { key: 'let', effects: [fx.gold(-25), fx.clearFlag('thief_pressed')] },
    ],
  },
  {
    id: 'village_warning', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'village_friend', days: [4, 8] },
    choices: [
      { key: 'strike', effects: [fx.spawnBand('bandits', { size: 0.8 }), fx.nextBattle('gold'), fx.clearFlag('village_friend')] },
      { key: 'around', effects: [fx.reveal({ radius: 6 }), fx.clearFlag('village_friend')] },
    ],
  },
  {
    id: 'bandits_vengeance', trigger: 'flag', weight: 1, cond: {}, cooldownDays: 0, after: { flag: 'scouts_taken', days: [2, 5] },
    choices: [
      { key: 'fight', effects: [fx.spawnBand('bandits', { hunts: true }), fx.clearFlag('scouts_taken')] },
      { key: 'pay', cost: [fx.gold(-40)], effects: [fx.clearFlag('scouts_taken')] },
    ],
  },
  {
    // campaign-arc.md R5: a narrative card with one choice (R6), due the day the arc sets the flag.
    id: 'host_musters', trigger: 'flag', weight: 1, cond: {}, unique: true, cooldownDays: 0, after: { flag: 'host_musters', days: [0, 0] },
    choices: [{ key: 'arms', effects: [] }],
  },
];

/** Narrative cards the GDD gives a single choice (R6); every other event has 2-3 (R1). */
export const NARRATIVE_CARDS: readonly string[] = ['host_musters'];

/** The deck the world draws from: the starter deck when enabled, else none (V5-070). */
export function liveDeck(enabled: boolean = EVENT_DECK_ENABLED): readonly EventDef[] {
  return enabled ? STARTER_DECK : [];
}
