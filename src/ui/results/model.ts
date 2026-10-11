/**
 * The rules of the Results screen (RES-01, design/ux/screens-campaign.md C-10)
 * that don't need Phaser: which pages show, what Back does, the arc's Victory
 * variant, the spoils sections and the summary's note chips. Unit-tested in
 * tests/results.test.ts; ResultsScene draws them.
 */
import { itemDef, normalizeRarity, type Item } from '../../data/items';
import type { BattleReport, ReportResult } from '../../game/report';
import { t, tOr } from '../../i18n';
import { CULTURE_LABEL, type Culture } from '../../data/names';

export type ResultsPage = 'summary' | 'heroes' | 'spoils';

/** A practice fight has no Spoils tab ("Practice: no spoils", V5-039). */
export function pagesFor(practice: boolean): ResultsPage[] {
  return practice ? ['summary', 'heroes'] : ['summary', 'heroes', 'spoils'];
}

/**
 * System Back (audit RES-6, NAV N8): it never takes the spoils unseen. With
 * spoils the player hasn't looked at, it opens the Spoils tab; otherwise it
 * leaves like Onward (and says what was taken).
 */
export function backAction(o: { page: ResultsPage; loot: number; seenSpoils: boolean }): 'spoils' | 'leave' {
  return o.loot > 0 && !o.seenSpoils && o.page !== 'spoils' ? 'spoils' : 'leave';
}

/** The host beaten (campaign-arc.md R5.4): the arc stands at 'won' until its Victory screen has been seen. */
export function isArcVictory(stage: string | undefined, result: ReportResult): boolean {
  return stage === 'won' && result === 'victory';
}

/** The company roll of the Victory variant: every survivor by name, then the fallen. */
export function companyRoll(r: Pick<BattleReport, 'heroes'>): { survivors: string[]; fallen: string[] } {
  return { survivors: r.heroes.filter((h) => !h.died).map((h) => h.name), fallen: r.heroes.filter((h) => h.died).map((h) => h.name) };
}

/** The arc's legendary set piece (Campaign.winArc puts it first in the loot); null when the set is already complete. */
export function arcPiece(loot: readonly Item[]): Item | null {
  const it = loot[0];
  return it && normalizeRarity(it.rarity) === 'legendary' && itemDef(it.def).set ? it : null;
}

export interface SpoilSection {
  /** Header i18n key; null = no header (a plain field battle). */
  title: 'results.hoard' | 'results.field' | null;
  from: number;
  to: number;
}

/** The Spoils grid in sections: a lair's hoard leads the loot under its own header (campaign-arc.md R6). */
export function spoilSections(n: number, hoard: number): SpoilSection[] {
  const h = Math.max(0, Math.min(hoard, n));
  if (h === 0) return [{ title: null, from: 0, to: n }];
  const out: SpoilSection[] = [{ title: 'results.hoard', from: 0, to: h }];
  if (h < n) out.push({ title: 'results.field', from: h, to: n });
  return out;
}

export interface NoteChip {
  icon: string;
  text: string;
  /** 'badge': a promotion, drawn as a gilded badge (audit RES-5). */
  tone: 'badge' | 'good' | 'plain';
}

/**
 * The Summary's note chips (audit RES-5): promotions first as a badge, the
 * captain's bounty (ai-doctrines.md R6.4), the practice rule, then the
 * report's own notes (siege, hex taken, rating...). With no hero of the
 * battle (nobody killed anyone, plan ANSWERS A-36) a plain line says so.
 */
export function noteChips(r: Pick<BattleReport, 'heroes' | 'bounty' | 'notes' | 'mvp'>, o: { practice: boolean }): NoteChip[] {
  const out: NoteChip[] = [];
  const ups = r.heroes.filter((h) => h.levelsGained > 0);
  if (ups.length) out.push({ icon: 'xp', text: `${t('results.levelUp')} ${ups.map((h) => h.name).join(', ')}`, tone: 'badge' });
  if (r.bounty > 0) out.push({ icon: 'coin', text: t('why.bounty', { n: r.bounty }), tone: 'good' });
  if (o.practice) out.push({ icon: 'info', text: t('results.noSpoilsPractice'), tone: 'plain' });
  for (const n of r.notes) out.push({ icon: 'info', text: n, tone: 'plain' });
  if (!r.mvp && r.heroes.length) out.push({ icon: 'info', text: t('results.noMvp'), tone: 'plain' });
  return out;
}

/**
 * Who the battle was against, in the player's language: a band's name
 * (`band`: WorldScene bandName), a lair or a beast as labelled, else the
 * enemy's people (data.ru.ts `culture.*`, e.g. "карфагеняне").
 */
export function vsName(last: { label?: string; enemy: { culture: Culture } }, band: (name: string) => string): string {
  if (last.label) return band(last.label);
  const c = last.enemy.culture;
  return tOr(`culture.${c}`, CULTURE_LABEL[c]);
}
