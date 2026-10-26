/**
 * The team colours, one palette for the world map and the region view: a team is its alliance, drawn in the alliance's
 * colour everywhere (ALLIANCES color, as the world art paints them: Dodona blue, Skythia gold, Kyrene red, Elaia
 * purple). Your own side is not recoloured; the region marks it apart (a full, wider foot ring under your men, "Your
 * land" in the ownership mode).
 */
import { ALLIANCES } from './alliances';

export type RGB = [number, number, number];

/** CSS colour per team id. */
export const TEAM_CSS: readonly string[] = ALLIANCES.map((a) => a.color);
/** 0xrrggbb per team id. */
export const TEAM_INT: readonly number[] = TEAM_CSS.map((c) => parseInt(c.slice(1), 16));
/** [r, g, b] (0..255) per team id. */
export const TEAM_RGB: readonly RGB[] = TEAM_INT.map((c): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
