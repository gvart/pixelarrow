/**
 * Names that are not allowed (ADR-0009 §6): a short English and Russian list
 * of slurs and sexual terms, matched as substrings of the folded key
 * (validate.ts nameKey). Kept short on purpose: every entry also blocks the
 * innocent names that contain it (the Scunthorpe problem), so broad stems
 * such as "ass" or "rape" are left out and admin rename covers the rest.
 * The owner reviews this list. Players only ever see "This name isn't allowed".
 */
export const BLOCKLIST = [
  // English
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'asshole', 'dickhead', 'pussy', 'penis', 'vagina',
  'porn', 'nigger', 'nigga', 'faggot', 'retard', 'rapist', 'hitler', 'nazi',
  // Russian
  'хуй', 'хуе', 'хуя', 'пизд', 'ебан', 'ебал', 'ебат', 'заеб', 'выеб', 'бляд', 'блят', 'сука', 'суки',
  'пидор', 'пидар', 'гандон', 'залуп', 'мудак', 'мудил', 'шлюх', 'дроч', 'порн', 'хер', 'жопа',
];
