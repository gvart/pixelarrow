/**
 * W-96: a new season is a full reset for every path: men, gear, belongings and titles. Everything a player owned or
 * earned toward this season goes, and he makes his start again (alliance, home, path; ./start.ts). What stays is the
 * record of seasons past and what is not a player's standing: test/war/seasonWipe.test.ts sorts every war table into
 * one or the other, so a new table fails the build until it is placed.
 */
export const SEASON_WIPE = [
  // titles: the crown and the lordships (W-63, W-64, W-94), the demigod's level (W-83), region mastery, tasks
  'war_crown_shares', 'war_crown_orders', 'war_crown_ballots', 'war_crown_votes', 'war_crown_offices', 'war_crown_pacts', 'war_crown_log', 'war_crowns',
  'war_settlement_log', 'war_settlement_offers', 'war_settlement_members', 'war_settlements',
  'war_favour_log', 'war_favour', 'war_mastery_done', 'war_mastery', 'war_task_tally', 'war_tasks',
  // belongings: strongrooms, stalls, warehouses and what they hold, open deals, things in the field
  'war_contracts', 'war_letters', 'war_deals', 'war_offers', 'war_gifts', 'war_crafts', 'war_goods', 'war_holders', 'war_region_holds', 'war_region_state',
  // men and gear, and what hung on them
  'war_trophies', 'war_memorial', 'war_tunnel', 'war_upkeep', 'war_items', 'war_persons',
  // the start itself: alliance, home and path are chosen anew
  'war_alliance_clans', 'war_alliance_members',
] as const;

export async function seasonWipe(d: D1Database): Promise<void> {
  await d.batch(SEASON_WIPE.map((t) => d.prepare(`DELETE FROM ${t}`)));
}
