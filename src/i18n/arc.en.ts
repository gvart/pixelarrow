/**
 * The campaign arc on the world map (WLD-02; design/gdd/campaign-arc.md, design/ux/screens-campaign.md C-4):
 * the arc chip, the Arc sheet (Lairs and Journal), the Assault sheet, the lair and host plates, the banners
 * and the first-visit coach marks. arc.ru.ts has the same keys and {params}.
 */
export const ARC_EN = {
  // the lairs' names (world/map.ts names them in English)
  'arc.lairName.Pirate cove': 'Pirate cove',
  'arc.lairName.Bandit camp': 'Bandit camp',
  'arc.lairName.Galatae camp': 'Galatae camp',
  // the arc chip under the situation line: the goal, and how far along it is
  'arc.chip.lairs': 'Lairs {n}/{total}',
  'arc.chip.host': 'Stop the host',
  'arc.chip.won': 'Tyrant beaten',
  'arc.chip.tip': "The campaign: burn the lairs, then beat the Tyrant's host",
  // the Arc sheet
  'arc.title': 'The campaign',
  'arc.tab.lairs': 'Lairs',
  'arc.tab.journal': 'Journal',
  'arc.goal.lairs': "Burn all {total} lairs. When the last one falls, the Tyrant's host marches.",
  'arc.goal.host': "The Tyrant's host marches on {town}. Beat it in battle to win the campaign.",
  'arc.goal.won': 'The Tyrant is beaten. The world goes on: reborn lairs rise again to be burnt.',
  'arc.sacked': { one: '{town} is sacked: no recruits or market for {n} day.', other: '{town} is sacked: no recruits or market for {n} days.' },
  'arc.host.row': { one: '{n} man · marching on {town}', other: '{n} men · marching on {town}' },
  'arc.lair.standing': { one: 'Standing · {n} man', other: 'Standing · {n} men' },
  'arc.lair.reborn': { one: 'Reborn · {n} man', other: 'Reborn · {n} men' },
  'arc.lair.burnt': 'Burnt',
  'arc.lair.unknown': 'Not found yet',
  'arc.lair.near': 'near {town}',
  'arc.lair.tapHint': 'Tap a lair to find it on the map.',
  // the Assault sheet
  'arc.as.level': 'Garrison of {culture}, about level {lv}',
  'arc.as.walls': 'Behind a palisade with two gates. A garrison never retreats.',
  'arc.as.reward': 'Hoard: {n} picks, one epic guaranteed',
  'arc.as.rewardReborn': 'A missing piece of the legendary set, while any is missing',
  'arc.as.counts': 'Counts toward the campaign: {n}/{total} burnt.',
  'arc.as.rebornNote': 'A reborn lair: it does not count toward the campaign.',
  'arc.as.far': 'Too far to strike from here. March there first: this sheet opens again when you arrive.',
  'arc.as.empty': 'Its garrison is gone. The lair falls without a fight.',
  'arc.as.assault': 'Assault',
  'arc.as.march': 'March there',
  'arc.as.burn': 'Burn it',
  'arc.as.leave': 'Leave',
  // banners
  'arc.bn.burnt': '{name} burns! Lairs {n}/{total}.',
  'arc.bn.ashes': '{name} lies in ashes.',
  'arc.bn.host': "The Tyrant's host marches on {town}!",
  'arc.bn.tier3': 'The bands out here wear real bronze now.',
  // coach marks of the first visit (campaign-arc.md R1.6)
  'arc.coach.goal': "Your campaign: burn the six lairs, then beat the Tyrant's host. This chip keeps count.",
  'arc.coach.bands': 'Weaker bands (green plates) are safe fights. Grow before you hunt lairs.',
  'arc.coach.towns': 'Towns hire and heal. Camp to rest.',
} as const;
