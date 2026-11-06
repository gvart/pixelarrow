/** Skill vectors (src/war/sim/skills.ts): activeCooldown by WIL, legalSkills of every class at every other level from mixed picks. */
import { activeCooldown, legalSkills, SKILLS } from '../../war/sim/skills';
import { CIV_CLASSES, CLASSES } from '../../data/classes';
import { Rng } from '../../sim/rng';
import type { WarSkillId } from '../../war/types';

export const vectors = () => {
  const r = new Rng(17), ids = [...Object.keys(SKILLS), 'nope'] as WarSkillId[];
  const cooldowns = [0, 1, 4, 5, 6, 7, 10, 15, 20, 25, 30, 40, 5.5, 6.3].map((w) => [w, activeCooldown(w)]);
  const legal: unknown[] = [];
  for (const cls of [...Object.keys(CLASSES), ...Object.keys(CIV_CLASSES), 'mob_wolf', 'nobody']) for (let level = 1; level <= 10; level += 2) {
    const picked = Array.from({ length: r.int(0, 6) }, () => r.pick(ids));
    if (level === 7) picked.push(picked[0] ?? 'shieldDrill', picked[0] ?? 'shieldDrill');
    legal.push([cls, level, picked, legalSkills(cls, level, picked)]);
  }
  return { cooldowns, legal };
};
