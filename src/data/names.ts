export type Culture = 'greek' | 'phoenician' | 'celtic';

export const NAMES: Record<Culture, string[]> = {
  greek: ['Lysandros', 'Nikias', 'Damon', 'Kleon', 'Brasidas', 'Leonidas', 'Phokion', 'Iason', 'Timon', 'Dexios', 'Kallias', 'Aristos', 'Menon', 'Theron', 'Philon', 'Agis', 'Lykos', 'Doros', 'Xanthos', 'Myron', 'Pyrrhos', 'Glaukos', 'Straton', 'Eudoros'],
  phoenician: ['Hanno', 'Himilco', 'Mago', 'Adherbal', 'Bomilcar', 'Hasdrubal', 'Gisco', 'Bodashtart', 'Abibaal', 'Eshmun', 'Milkyaton', 'Azmelek', 'Baalyaton', 'Germelqart', 'Hiram', 'Itobaal', 'Abdmelqart', 'Sakarbaal'],
  celtic: ['Brennos', 'Ambiorix', 'Dumnorix', 'Cingeto', 'Segovax', 'Teutomatos', 'Vercassos', 'Litavicos', 'Comux', 'Bituitos', 'Orgetorix', 'Andecos', 'Caturix', 'Epatix', 'Medrios', 'Senognatos', 'Tascovanos', 'Vindos'],
};

export const CULTURE_LABEL: Record<Culture, string> = { greek: 'Hellenes', phoenician: 'Carthaginians', celtic: 'Galatae' };
