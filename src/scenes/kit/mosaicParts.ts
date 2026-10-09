/**
 * The "Parts" page of the Kit gallery: the shared v4 components that the
 * "Mosaic" page does not show (icon buttons, action bars, tips, meters, chips,
 * pills, key buttons, round buttons, gear slots, pager, empty and loading
 * states, sheets, the sub-screen shell), each in its states. Docs: docs/UI_KIT.md.
 */
import Phaser from 'phaser';
import { addText, type ScrollArea } from '../../ui/kit';
import { toast } from '../../ui/widgets';
import { openModal } from '../../ui/widgets';
import { openSheet } from '../../ui/v3';
import { addEconState } from '../../ui/econ/widgets';
import {
  ChipRow, GAP, GearSlot, KeyButton, MActionBar, MBar, MButton, MChip, MIconButton, MPager, MStashGrid, OfferCard, ParchmentCard, RoundButton, SECTION_TITLE_H, SectionTitle, SituationLine, StatTile, TAP,
  addNiche, addParchmentEmpty, addPill, addRarityPill, addTipLine, mosaicImage, mtext, openParchmentSheet, rarityInk, type BarSlot,
} from '../../ui/mosaic';
import { defaultStashState } from '../../ui/sheet';
import { ITEM_LIST, RARITIES, type Rarity } from '../../data/items';
import { MOSAIC, RESOURCES } from '../../ui/tokens';
import type { UIMetrics } from '../../ui/kit';

type C = Phaser.GameObjects.Container;
type Scene = Phaser.Scene & { m: UIMetrics; ui: C };

/** Fills `area.content` (`w` wide) with the parts; returns the content height. `openShell` opens the sub-screen shell demo. */
export function buildParts(scene: Scene, area: ScrollArea, w: number, openShell: () => void): number {
  const c = area.content;
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (c.add(o), o);
  const G = GAP + 1;
  let y = 2;
  const title = (s: string) => {
    add(new SectionTitle(scene, 0, y, w, s, { size: 8 }));
    y += SECTION_TITLE_H + 2;
  };

  title('MIconButton');
  // a flow: buttons wrap onto the next row when the width ends
  let fx = 0;
  const flow = (bw: number, bh: number, o: ConstructorParameters<typeof MIconButton>[5]) => {
    if (fx > 0 && fx + bw > w) {
      fx = 0;
      y += bh + G;
    }
    add(new MIconButton(scene, fx, y, bw, bh, o));
    fx += bw + G;
  };
  for (const v of ['secondary', 'neutral', 'primary', 'selected', 'lit'] as const) flow(TAP, TAP, { icon: 'eye', label: v, variant: v, onClick: () => toast(scene, v) });
  flow(TAP, TAP, { icon: 'lock', label: 'Off', off: 'Not yet' });
  flow(TAP, TAP, { icon: 'chest', label: 'Badge', badge: 3 });
  flow(TAP, TAP, { icon: 'tent', label: 'Count', variant: 'neutral', count: '2' });
  flow(TAP, TAP, { text: '+', label: 'Plus', variant: 'secondary' });
  flow(TAP, TAP, { text: 'III', label: 'Group', variant: 'neutral' });
  flow(40, 26, { icon: 'plus', label: 'Wide', variant: 'neutral' });
  y += 26 + G + 2;

  title('MActionBar');
  const slots: BarSlot[] = [{ label: 'Camp', icon: 'tent', onClick: () => toast(scene, 'Camp') }, { label: 'Rest', icon: 'flag', selected: true }, { label: 'Party', icon: 'people', primary: true, badge: '!' }];
  const stone = add(new MActionBar(scene, w, y + 34, { info: false })).set(slots);
  y += 34 + G;
  add(new MActionBar(scene, w, y + 34, { id: 'kit.bar.off' })).set([{ label: 'March', primary: true }, { label: 'Garrison', off: 'Needs a settlement' }, { label: 'Map', icon: 'map', iconOnly: true }]);
  y += 34 + G;
  add(new MActionBar(scene, w, y + 46, { info: true, id: 'kit.bar.info' })).setInfo('The info line over the buttons').set([{ label: 'Place', primary: true }, { label: 'Cancel' }]);
  y += 46 + G;
  const par = add(new MActionBar(scene, w, y + 32, { surface: 'parchment', id: 'kit.bar.parchment' })).set([{ label: 'Undo', icon: 'back', variant: 'neutral' }, { label: 'Confirm 3', icon: 'check', variant: 'primary' }]);
  y += par.h + G;
  void stone;

  title('Tips');
  y += addTipLine(scene, c, 0, y, w, { text: 'Flat info tip on the page.', tone: 'info' }) + G;
  y += addTipLine(scene, c, 0, y, w, { text: 'A chest is ready to claim.', tone: 'reward' }) + G;
  y += addTipLine(scene, c, 0, y, w, { text: 'Your team is over this floor\'s budget.', tone: 'warn' }) + G;
  y += addTipLine(scene, c, 0, y, w, { text: 'A card with a close X that hides it for good.', card: true, dismissId: 'kit.parts' }) + G;
  y += addTipLine(scene, c, 0, y, w, { text: 'A warning on a card.', card: true, tone: 'warn' }) + G;

  title('MBar and chips');
  add(new MBar(scene, 0, y, w, { value: 3, max: 5, color: MOSAIC.gold, label: 'Label', right: '3 / 5' }));
  y += 11 + 5 + G;
  add(new MBar(scene, 0, y, w, { value: 0, max: 5, color: RESOURCES.glory.color, label: 'Used up', right: '0 / 5', quiet: true, h: 4 }));
  y += 11 + 4 + G;
  add(new MBar(scene, 0, y, w, { value: 40, max: 100, color: RESOURCES.xp.color, label: 'Speed', right: '40 > 55', rightTone: 'good', preview: 55, h: 6, size: 6.5, tip: 'A stat with a pending gain' }));
  y += TAP + G;
  add(new MBar(scene, 0, y, w, { value: 40, max: 100, color: RESOURCES.xp.color, label: 'Reload', right: '40 > 25', rightTone: 'bad', preview: 25, worse: true, h: 6, size: 6.5, tip: 'A stat with a pending loss' }));
  y += TAP + G;
  add(new MChip(scene, 0, y, { icon: 'laurel', value: 640, surface: 'stone', tall: true, w: 64 }));
  add(new MChip(scene, 68, y, { icon: 'xp', value: 7, surface: 'stone', tall: true, w: 52, progress: 0.6, progressColor: RESOURCES.xp.color, onClick: () => toast(scene, 'Level') }));
  y += TAP + G;
  const dark = scene.add.container(0, y);
  dark.add(mosaicImage(scene, 0, 0, w, 22, 'topBar'));
  dark.add(new ChipRow(scene, 2, 2, w - 4, [{ icon: 'coin', value: '240' }, { icon: 'cross', value: '3' }, { icon: 'people', value: '9' }], 'stone'));
  add(dark);
  y += 22 + G;
  add(new ChipRow(scene, 0, y, w, [{ icon: 'coin', value: '240' }, { icon: 'trophy', value: '3', short: '3' }, { icon: 'people', value: '9 men', short: '9' }]));
  y += 18 + G;
  const sit = add(new SituationLine(scene, 0, y, w, { compact: true }));
  sit.set('The march is on: 3 days to the pass.', false, [{ icon: 'coin', value: '240' }, { icon: 'people', value: '9' }]);
  y += sit.h + G;
  const tw = Math.floor((w - 2 * G) / 3);
  add(new StatTile(scene, 0, y, tw, 40, { icon: 'swords', label: 'Kills', value: 12 }));
  add(new StatTile(scene, tw + G, y, tw, 40, { icon: 'coin', label: 'Gold', value: 60, prefix: '+', tone: 'good' }));
  add(new StatTile(scene, 2 * (tw + G), y, w - 2 * (tw + G), 40, { icon: 'skull', label: 'Losses', value: 3, tone: 'bad' }));
  y += 40 + G;
  const oc = (i: number, name: string, state: ConstructorParameters<typeof OfferCard>[5]['state']) => add(new OfferCard(scene, i * (Math.floor((w - G) / 2) + G), y, Math.floor((w - G) / 2), 66, { name, state, art: (card, cx, cy) => card.add(scene.add.rectangle(cx, cy, 24, 24, MOSAIC.bronze)) }));
  oc(0, 'Owl emblem', { kind: 'price', text: '120', icon: 'drachma' });
  oc(1, 'Too dear', { kind: 'price', text: '900', icon: 'drachma', short: true });
  y += 66 + G;
  oc(0, 'Pegasus', { kind: 'equipped', text: 'Equipped' });
  oc(1, 'Season victor', { kind: 'locked', text: 'Season reward', icon: 'lock' });
  y += 66 + G + 2;

  title('Pills and rarity ink');
  let px = 0;
  for (const [text, color] of [['Warrior', MOSAIC.bronze], ['Level 3', MOSAIC.terra], ['Archer', MOSAIC.teal]] as const) px += addPill(scene, c, px, y, text, color) + G;
  addPill(scene, c, w, y, '-20%', MOSAIC.inkGood, 40, true);
  y += 12 + G;
  px = 0;
  for (const r of RARITIES as readonly Rarity[]) px += addRarityPill(scene, c, px, y, r, r, 70) + 2;
  y += 12 + G;
  RARITIES.forEach((r, i) => add(mtext(scene, (i % 3) * Math.floor(w / 3), y + Math.floor(i / 3) * 10, `Name ${r}`, rarityInk(scene, r), { maxW: Math.floor(w / 3) - 2 })));
  y += 20 + G + 2;

  title('Key and round buttons');
  const kw = Math.floor((w - 3 * G) / 4);
  (['primary', 'bronze', 'stone'] as const).forEach((v, i) => add(new KeyButton(scene, i * (kw + G), y, kw, 26, { label: 'Charge', icon: 'swords', variant: v })));
  add(new KeyButton(scene, 3 * (kw + G), y, kw, 26, { label: 'Charge', icon: 'swords', lit: true }));
  y += 26 + G;
  add(new KeyButton(scene, 0, y, kw, 26, { label: 'Hold', disabledReason: 'Not now' }));
  add(new KeyButton(scene, kw + G, y, kw, 26, { label: 'Retreat', icon: 'flag', iconOnly: true }));
  add(new KeyButton(scene, 2 * (kw + G), y, kw, 26, { label: 'A very long word', variant: 'stone' }));
  add(new KeyButton(scene, 3 * (kw + G), y, kw, 26, { label: 'Plain Inter', plain: true }));
  y += 26 + G;
  add(new RoundButton(scene, 0, y, { icon: 'tent', label: 'Camp' }));
  add(new RoundButton(scene, 44, y, { icon: 'people', label: 'Party', badge: 2 }));
  y += RoundButton.size({}).h + G + 2;

  title('Gear, pager, niche');
  const ss = 26;
  add(new GearSlot(scene, 0, y, { slot: 'weapon', size: ss, onTap: () => toast(scene, 'Empty') }));
  add(new GearSlot(scene, ss + G, y, { slot: 'armor', size: ss, selected: true, onTap: () => toast(scene, 'Selected') }));
  const sample = ITEM_LIST.slice(0, 6).map((d, i) => ({ uid: `kp${i}`, def: d.id, rarity: RARITIES[i % RARITIES.length], cond: 30 + i * 12 }));
  add(new GearSlot(scene, 2 * (ss + G), y, { slot: 'weapon', item: sample[0], size: ss, onTap: () => toast(scene, 'Item') }));
  add(new MPager(scene, w - 80, y + 2, { index: 2, count: 9, onPrev: () => undefined, onNext: () => undefined, prevTip: 'Previous', nextTip: 'Next' }));
  y += ss + G;
  addNiche(scene, c, 0, y, 50, 40);
  y += 40 + G + 2;

  title('Stash grid');
  const stash = new MStashGrid(scene, c, 0, y, w, 120, { items: () => sample, state: defaultStashState(), onTap: (it) => toast(scene, it.def) });
  void stash;
  y += 120 + G + 2;

  title('Empty and loading states');
  const empty = add(new ParchmentCard(scene, 0, y, w, 70));
  empty.add(addParchmentEmpty(scene, 0, 0, w, 70, { icon: 'tent', title: 'Empty stash', hint: 'Win battles to take loot from the field.', action: { label: 'Find a fight', onClick: () => toast(scene, 'Off to war') } }));
  y += 70 + G;
  addEconState(scene, c, 0, y, w, 40, 'loading', () => undefined);
  y += 40 + G;
  addEconState(scene, c, 0, y, w, 90, 'offline', () => toast(scene, 'Retry'));
  y += 90 + G + 2;

  title('Sheets and shells');
  const bw = Math.floor((w - G) / 2);
  add(new MButton(scene, 0, y, bw, 24, { label: 'Sheet', variant: 'secondary', onClick: () => openParchmentSheet(scene, { title: 'Parchment sheet', h: 96, actions: [{ label: 'Cancel', variant: 'neutral' }, { label: 'Confirm', variant: 'primary' }] }) }));
  add(new MButton(scene, bw + G, y, w - bw - G, 24, { label: 'Docked', variant: 'secondary', onClick: () => openParchmentSheet(scene, { title: 'Docked sheet', h: 80, dock: 'bottom' }) }));
  y += 24 + G;
  add(new MButton(scene, 0, y, bw, 24, { label: 'Decision', variant: 'neutral', onClick: () => openParchmentSheet(scene, { title: 'No X, no shade tap', h: 70, shadeCloses: false, actions: [{ label: 'Close', variant: 'primary', onClick: undefined }] }) }));
  add(new MButton(scene, bw + G, y, w - bw - G, 24, { label: 'openModal', variant: 'neutral', onClick: () => { const m = openModal(scene, { title: 'Legacy modal', h: 80 }); m.c.add(addText(scene, m.body.x, m.body.y, 'Re-inked content', 'ink')); } }));
  y += 24 + G;
  add(new MButton(scene, 0, y, bw, 24, { label: 'openSheet', variant: 'neutral', onClick: () => openSheet(scene, { title: 'Bottom sheet', h: 80 }) }));
  add(new MButton(scene, bw + G, y, w - bw - G, 24, { label: 'Sub-shell', variant: 'primary', onClick: openShell }));
  y += 24 + G;
  return y + 4;
}
