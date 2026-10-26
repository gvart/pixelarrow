/**
 * Painted icons from the game's two atlases (public/icons/ui.png: stats, skills, honours, states; public/icons/items.png:
 * gear, trinkets, goods) for the soldier views and the descriptions (./codex.ts). A glyph is an empty element with its
 * key; one stylesheet, written once the atlases' frame lists are in, sizes every key by percentages, so a glyph renders
 * at any size and a view built before the load fills in by itself.
 */
type Frame = { x: number; y: number; w: number; h: number };
interface Atlas { file: string; w: number; h: number; frames: Record<string, Frame> }

const atlases: Atlas[] = [];
let loading: Promise<void> | null = null;

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;
function rules(a: Atlas): string {
  return Object.entries(a.frames).map(([k, f]) => {
    const px = a.w === f.w ? 0 : f.x / (a.w - f.w), py = a.h === f.h ? 0 : f.y / (a.h - f.h);
    return `.gl[data-g="${k}"]{background-image:url(icons/${a.file});background-size:${pct(a.w / f.w)} ${pct(a.h / f.h)};background-position:${pct(px)} ${pct(py)}}`;
  }).join('\n');
}

/** Load both atlases once and write the glyph stylesheet. */
export function loadGlyphs(): Promise<void> {
  loading ??= Promise.all(['ui', 'items'].map((n) => fetch(`icons/${n}.json`).then((r) => r.json()).then((j: { frames: Record<string, { frame: Frame }>; meta: { size: { w: number; h: number } } }) => {
    atlases.push({ file: `${n}.png`, w: j.meta.size.w, h: j.meta.size.h, frames: Object.fromEntries(Object.entries(j.frames).map(([k, v]) => [k, v.frame])) });
  }))).then(() => {
    const style = document.createElement('style');
    style.textContent = `.gl{display:inline-block;flex:none;vertical-align:middle;background-repeat:no-repeat;image-rendering:auto}\n${atlases.map(rules).join('\n')}`;
    document.head.appendChild(style);
  }).catch(() => undefined);
  return loading;
}

/** Is `key` in an atlas (false until they are in). */
export const hasGlyph = (key: string) => atlases.some((a) => key in a.frames);

/** An atlas icon `key` (e.g. `ui:heart`, `item:dory`) at `px` art px. */
export const glyph = (key: string, px = 16, extra = '') => `<i class="gl${extra ? ' ' + extra : ''}" data-g="${key}" style="width:${px}px;height:${px}px"></i>`;
