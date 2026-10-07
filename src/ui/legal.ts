/** The legal pages (public/*.html, served at pixelarrow.app/terms etc.; Russian under /ru/). */
export type LegalPage = 'terms' | 'privacy' | 'refunds';

export const LEGAL_BASE = 'https://pixelarrow.app';

export function legalUrl(page: LegalPage, lang: string): string {
  return `${LEGAL_BASE}${lang === 'ru' ? '/ru' : ''}/${page}`;
}
