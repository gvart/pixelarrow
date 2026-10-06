export type Culture = 'greek' | 'phoenician' | 'celtic';

export const NAMES: Record<Culture, string[]> = {
  greek: [
    'Lysandros', 'Nikias', 'Damon', 'Kleon', 'Brasidas', 'Leonidas', 'Phokion', 'Iason', 'Timon', 'Dexios', 'Kallias', 'Aristos',
    'Menon', 'Theron', 'Philon', 'Agis', 'Lykos', 'Doros', 'Xanthos', 'Myron', 'Pyrrhos', 'Glaukos', 'Straton', 'Eudoros',
    'Alkimos', 'Demaratos', 'Euthymos', 'Hippias', 'Kimon', 'Laches', 'Meleagros', 'Nearchos', 'Orestes', 'Pausanias', 'Sostratos', 'Telamon',
    'Akakios', 'Charmides', 'Diokles', 'Epameinon', 'Kratos', 'Lampon', 'Mnason', 'Polydoros', 'Simonides', 'Thrasyllos', 'Xenias', 'Zopyros',
  ],
  phoenician: [
    'Hanno', 'Himilco', 'Mago', 'Adherbal', 'Bomilcar', 'Hasdrubal', 'Gisco', 'Bodashtart', 'Abibaal', 'Eshmun', 'Milkyaton', 'Azmelek',
    'Baalyaton', 'Germelqart', 'Hiram', 'Itobaal', 'Abdmelqart', 'Sakarbaal', 'Hamilcar', 'Bodmelqart', 'Carthalo', 'Maharbal', 'Abdeshmun', 'Baalhanno',
    'Gerashtart', 'Mattan', 'Yehawmilk', 'Arish', 'Bostar', 'Hannibaal', 'Magon', 'Abdtanit', 'Baalshillek', 'Eshmunazar', 'Muttumbaal', 'Zimrida',
  ],
  celtic: [
    'Brennos', 'Ambiorix', 'Dumnorix', 'Cingeto', 'Segovax', 'Teutomatos', 'Vercassos', 'Litavicos', 'Comux', 'Bituitos', 'Orgetorix', 'Andecos',
    'Caturix', 'Epatix', 'Medrios', 'Senognatos', 'Tascovanos', 'Vindos', 'Acichorios', 'Bolgios', 'Cavaros', 'Deiotaros', 'Eposognatos', 'Gaesatos',
    'Kambaules', 'Luernios', 'Moricos', 'Nertomaros', 'Ortiagon', 'Rigantos', 'Sinorix', 'Toutissos', 'Uxellos', 'Velaunos', 'Cassivellos', 'Durnacos',
  ],
};

/** Roman numeral suffixes for when a culture's whole list is in use. */
const SUFFIX = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * A name not in `taken`: starts at index `start` of the culture's list and walks
 * forward to the first free one (no extra randomness, so the caller's rng
 * stream is unchanged). Falls back to "Name II", "Name III", ...
 */
export function freeName(culture: Culture, start: number, taken: ReadonlySet<string>): string {
  const list = NAMES[culture];
  for (const suffix of ['', ...SUFFIX]) {
    for (let k = 0; k < list.length; k++) {
      const n = list[(start + k) % list.length] + (suffix ? ` ${suffix}` : '');
      if (!taken.has(n)) return n;
    }
  }
  return `${list[start % list.length]} ${taken.size + 1}`;
}

/** Rename duplicates in place (later heroes give way); returns how many were renamed. */
export function dedupeNames(heroes: { name: string; culture: Culture }[]): number {
  const seen = new Set<string>();
  let renamed = 0;
  for (const h of heroes) {
    if (seen.has(h.name)) {
      const base = NAMES[h.culture].indexOf(h.name.split(' ')[0]);
      h.name = freeName(h.culture, Math.max(0, base), seen);
      renamed++;
    }
    seen.add(h.name);
  }
  return renamed;
}

export const CULTURE_LABEL: Record<Culture, string> = { greek: 'Hellenes', phoenician: 'Carthaginians', celtic: 'Galatae' };
