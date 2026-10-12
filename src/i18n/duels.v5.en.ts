/**
 * English strings of the v5 Duels hub (DUE-01; design/ux/screens-modes.md
 * M-2 .. M-4): the Armoury (was "Shop"), the ladder's Pausable line and its
 * expired-ticket notes, the Team's preset sheet, Recruit and Dismiss doors and
 * the army-row symbols. Spread into en.ts; ru.ts spreads duels.v5.ru.ts (same
 * keys, same {params}).
 */
export const DUELS_V5_EN = {
  'd5.armoury': 'Armoury',
  'd5.armouryTip': 'The Armoury: gear for Glory, and selling',
  'd5.armouryItem': 'Armoury',
  'd5.sellBody': 'The Armoury pays {n} Glory. This cannot be undone.',
  'd5.sellEmpty': 'Ladder wins and the Armoury fill the stash.',
  'd5.capTiny': '{n} of {cap} pts',
  'd5.teamTip': 'Your duel team: presets, heroes, recruits',
  // the ladder ticket (controls.md R10, CT-06)
  'd5.pausable': 'Pausable, at 0.5×, 1× or 2×. Finish within {m} min.',
  // the ticket's minutes are real time, pauses included, not the battle clock (DUE-02)
  'd5.note.expired': 'Your {m} real-time minutes for this floor ran out: verified, but it paid nothing',
  'd5.backExpired': 'Floor {n}: your {m} real-time minutes ran out, so it paid nothing',
  // DUE-02: Leaderboard, Raid picks, Season rewards (M-5 .. M-7)
  'd5.board': 'Leaderboard',
  'd5.boardEmpty': 'No ranked players yet',
  'd5.boardError': 'The leaderboard did not load.',
  'd5.board.notLegend': 'Only Legend players are listed here',
  'd5.raidError': 'The defenders did not load.',
  'd5.seasonOver': 'Season over',
  'd5.pickShort': 'Choose a piece',
  'd5.pickSet': 'Set: {set}',
  // the raids left are on the row under the tip: the tip does not repeat them
  'd5.sit.raid': 'Pick a defender and raid.',
  // the demo's second preset (a player-typed name is never translated)
  'd5.demoWall': 'Wall',
  // Team (M-3)
  'd5.roster': 'Duel army · {n}/{max}',
  'd5.rosterFull': 'The roster is full: dismiss someone from the bench first',
  'd5.presetTip': '{team}: tap again to rename, copy, delete or choose where it fights',
  'd5.presetSheet': 'Team: {team}',
  'd5.fightsOn': 'Fights on',
  'd5.fightsOnNone': 'Not used yet: pick where it fights.',
  'd5.useOnShort': 'In use',
  'd5.benchDismiss': 'Dismiss',
  'd5.benchDismissTip': 'Dismiss a hero from the bench',
  'd5.benchEmptyDismiss': 'Only bench heroes can be dismissed: bench someone first',
  'd5.symbolsTitle': 'Symbols',
  'd5.symbols.group': 'Battle group (I to IV): where he stands at deployment and whose orders he follows.',
  'd5.symbols.pts': 'Points: what he costs in a team. A team must stay within its cap.',
  'd5.symbols.badge': 'Points or a perk to spend: open the hero.',
  'd5.symbols.power': 'Power: his strength with his gear.',
  'd5.symbols.team': 'Lit row and a check: in the team you are editing.',
} as const;
