/** Picks the UI language from the URL, the player's setting, Telegram and the browser (src/i18n). */
import { detectLang, lang, setLang } from '../i18n';
import { state } from '../state';
import { telegramLanguage } from '../platform/telegram';

function urlLang(): string | null {
  try {
    return new URLSearchParams(location.search).get('lang');
  } catch {
    return null;
  }
}

/** Apply the current language choice. Returns whether the language changed. */
export function refreshLang(): boolean {
  const before = lang();
  let browser: readonly string[] = [];
  try {
    browser = navigator.languages ?? [navigator.language];
  } catch {
    /* no navigator */
  }
  setLang(detectLang({ url: urlLang(), setting: state.campaign?.data.settings.lang ?? 'auto', telegram: telegramLanguage(), browser }));
  return lang() !== before;
}
