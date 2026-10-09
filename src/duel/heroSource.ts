/**
 * The duel army on the hero sheet (HeroScene): changes apply to a local copy
 * at once and go to the duel API; the server's answer replaces the copy, and
 * a refused change reloads the profile and says why (src/scenes/heroSource.ts).
 */
import { itemDef } from '../data/items';
import { equipBlocker, equipFromStash, unequipInto } from '../game/gear';
import type { Hero } from '../data/units';
import { ATTR_IDS, ATTR_MAX, perkBlocker, type AttrId } from '../data/perks';
import type { HeroSource } from '../scenes/heroSource';
import { errorText } from '../online/client';
import { respecPrice } from './rules';
import { t } from '../i18n';
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

  /** Dismiss from the sheet: a hero on the bench only (the team view's rule), never the last one. */
  dismiss = {
    blocked: (heroId: string): string | null => {
      if (this.profile.heroes.length <= 1) return t('dv.dismissLast');
      if (this.profile.team.includes(heroId)) return t('dv.dismissBenchFirst');
      return null;
    },
    run: async (heroId: string): Promise<boolean> => {
      try {
        const r = await this.src.dismiss(heroId);
        this.profile = r.profile;
        return true;
      } catch (e) {
        this.onError?.(errorText(e));
        return false;
      }
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
    if (!h || i < 0 || equipBlocker(h, this.profile.stash[i])) return false;
    const it = equipFromStash(h.equip, this.profile.stash, i);
    this.send(this.src.equip(heroId, itemDef(it.def).slot, uid));
    return true;
  }

  unequip(heroId: string, slot: Parameters<HeroSource['unequip']>[1]): boolean {
    const h = this.hero(heroId);
    if (!h || !unequipInto(h.equip, slot, this.profile.stash)) return false;
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
