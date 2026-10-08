/**
 * The duel army on the hero sheet (HeroScene): changes apply to a local copy
 * at once and go to the duel API; the server's answer replaces the copy, and
 * a refused change reloads the profile and says why (src/scenes/heroSource.ts).
 */
import { itemDef } from '../data/items';
import type { Hero } from '../data/units';
import { ATTR_IDS, ATTR_MAX, perkBlocker, type AttrId } from '../data/perks';
import type { HeroSource } from '../scenes/heroSource';
import { errorText } from '../online/client';
import { respecPrice } from './rules';
import type { DuelProfileView, DuelSource } from './client';

export class DuelHeroSource implements HeroSource {
  onChange?: () => void;
  onError?: (message: string) => void;

  constructor(
    private src: DuelSource,
    public profile: DuelProfileView,
  ) {}

  respec = {
    price: (h: Hero) => respecPrice(h),
    currency: 'glory',
    run: (heroId: string) => {
      const h = this.hero(heroId);
      if (!h || this.profile.glory < respecPrice(h)) return false;
      this.send(this.src.respec(heroId));
      return true;
    },
  };

  heroes(): Hero[] {
    return this.profile.heroes;
  }
  stash() {
    return this.profile.stash;
  }
  gold() {
    return null;
  }
  repairCost() {
    return 0;
  }
  repair() {
    return false;
  }

  private hero(id: string): Hero | undefined {
    return this.profile.heroes.find((h) => h.id === id);
  }

  /** Sends a change; the answer (or a reload after a refusal) becomes the local copy. */
  private send(p: Promise<{ profile: DuelProfileView }>): void {
    p.then(
      (r) => {
        this.profile = r.profile;
        this.onChange?.();
      },
      (e) => {
        this.onError?.(errorText(e));
        void this.src.profile().then((pv) => {
          this.profile = pv;
          this.onChange?.();
        }, () => undefined);
      },
    );
  }

  equip(heroId: string, uid: string): boolean {
    const h = this.hero(heroId);
    const i = this.profile.stash.findIndex((x) => x.uid === uid);
    if (!h || i < 0) return false;
    const it = this.profile.stash[i];
    const def = itemDef(it.def);
    this.profile.stash.splice(i, 1);
    if (h.equip[def.slot]) this.profile.stash.push(h.equip[def.slot]!);
    h.equip[def.slot] = it;
    if (def.slot === 'weapon' && def.twoHanded && h.equip.shield) {
      this.profile.stash.push(h.equip.shield);
      delete h.equip.shield;
    }
    if (def.slot === 'shield' && h.equip.weapon && itemDef(h.equip.weapon.def).twoHanded) {
      this.profile.stash.push(h.equip.weapon);
      delete h.equip.weapon;
    }
    this.send(this.src.equip(heroId, def.slot, uid));
    return true;
  }

  unequip(heroId: string, slot: Parameters<HeroSource['unequip']>[1]): boolean {
    const h = this.hero(heroId);
    if (!h || !h.equip[slot]) return false;
    this.profile.stash.push(h.equip[slot]!);
    delete h.equip[slot];
    this.send(this.src.equip(heroId, slot, null));
    return true;
  }

  spendPoints(heroId: string, add: Record<AttrId, number>): boolean {
    const h = this.hero(heroId);
    const n = ATTR_IDS.reduce((a, k) => a + add[k], 0);
    if (!h || n <= 0 || n > h.points || ATTR_IDS.some((k) => h.attrs[k] + add[k] > ATTR_MAX)) return false;
    for (const k of ATTR_IDS) h.attrs[k] += add[k];
    h.points -= n;
    this.send(this.src.develop(heroId, add, []));
    return true;
  }

  takePerk(heroId: string, id: Hero['perks'][number]): boolean {
    const h = this.hero(heroId);
    if (!h || perkBlocker(h, id) !== null) return false;
    h.perks.push(id);
    this.send(this.src.develop(heroId, {}, [id]));
    return true;
  }

  back(scene: Phaser.Scene): void {
    scene.scene.start('Duel', { tab: 'team' });
  }
}
