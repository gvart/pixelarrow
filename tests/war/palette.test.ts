/** One team palette (src/war/world/palette.ts): the region draws each team in the colour the world art paints its alliance. */
import { describe, expect, it } from 'vitest';
import { ALLIANCES } from '../../src/war/world/alliances';
import { TEAM_CSS, TEAM_INT, TEAM_RGB } from '../../src/war/world/palette';
import { TEAM_RGB as REGION_RGB } from '../../src/war/view/mapModes';
import regions from '../../public/war/world/regions.json';

const art = regions as unknown as { alliances: Record<string, { color: string }> };

describe('team palette', () => {
  it('each team is its alliance\'s world-map colour, in the region too', () => {
    for (const a of ALLIANCES) {
      expect(TEAM_CSS[a.id]).toBe(art.alliances[a.key].color);
      expect(TEAM_INT[a.id]).toBe(parseInt(art.alliances[a.key].color.slice(1), 16));
      expect(REGION_RGB[a.id]).toEqual(TEAM_RGB[a.id]);
    }
  });
});
