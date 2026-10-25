// A biome's objects.json also holds sprites other scripts write into it (town.mjs: the town-* set; hand-composed pieces
// such as elaia's waterfall-tall). Rebuilding the biome (build.mjs --biome) must not drop them: every entry of the
// previous file this build does not make is kept after the built ones, with the palette colours they brought and the
// file-level settings they set (borderMax).
export function keepForeign(prev, built) {
  if (!prev) return { json: built, kept: [] };
  const ids = new Set(built.objects.map((o) => o.id));
  const kept = prev.objects.filter((o) => !ids.has(o.id));
  const have = new Set(built.palette);
  const json = {
    ...built,
    palette: [...built.palette, ...prev.palette.filter((c) => !have.has(c))],
    objects: [...built.objects, ...kept],
    ...(prev.borderMax !== undefined && built.borderMax === undefined && { borderMax: prev.borderMax }),
  };
  return { json, kept: kept.map((o) => o.id) };
}
