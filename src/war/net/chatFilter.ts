/**
 * W-62 E6: the chat's word filter (the server applies it before a message is kept or relayed). Per word (split on
 * spaces, its edge punctuation off): fold case and leetspeak (0 o, 1 i, 3 e, 4 a, 5 s, 7 t, @ a, $ s, ! i), drop anything but letters (f.u.c.k,
 * f_ck), then a word that holds a ROOT anywhere (runs of one letter folded: fuuuck) or equals a WORD (runs of 3+ folded
 * to 2: asss, so "as" and "class" stay clean) is masked as ***.
 */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't' };
/** Bad anywhere in a word. */
const ROOTS = ['fuck', 'fuk', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'retard', 'dick', 'pussy', 'wank', 'bastard', 'motherf'];
/** Bad only as the whole word. */
const WORDS = ['ass', 'asshole', 'fag', 'cock', 'twat', 'prick', 'kys', 'nazi', 'rape', 'piss', 'tits'];

const fold = (w: string) => [...w.toLowerCase().replace(/^["'(]+|[.,!?;:"')]+$/g, '')].map((c) => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const ones = (w: string) => w.replace(/(.)\1+/g, '$1');
const twos = (w: string) => w.replace(/(.)\1{2,}/g, '$1$1');
const ROOTS1 = ROOTS.map(ones);
const WORDS2 = new Set(WORDS.map(twos));

export function isBad(word: string): boolean {
  const f = fold(word);
  if (!f) return false;
  const o = ones(f);
  return ROOTS1.some((r) => o.includes(r)) || WORDS2.has(twos(f));
}

/** The text with every bad word masked as ***, its spacing kept. */
export function maskText(text: string): string {
  return text.replace(/\S+/g, (w) => (isBad(w) ? '***' : w));
}
