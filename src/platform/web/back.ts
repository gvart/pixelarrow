/**
 * Back on the web: the browser's (and Android's) Back pops a guard history
 * entry, which runs the game's back callback instead of leaving the page.
 * One guard entry is kept while a callback is set. Escape is not handled here:
 * it belongs to the input layer, which calls nav.back().
 */
import type { BackButton } from '../core/back';
import type { PlatformEnv } from '../core/env';

export function createWebBack(env: PlatformEnv): BackButton {
  let handler: (() => void) | null = null;
  let guarded = false;
  let skipPop = 0; // popstates caused by our own history.back()
  let listening = false;
  let confirming = false;

  const guard = (): void => {
    if (guarded || !handler || !env.window?.history) return;
    env.window.history.pushState({ pixelarrow: 'back' }, '');
    guarded = true;
  };
  const onPop = (): void => {
    if (skipPop > 0) {
      skipPop--;
      return;
    }
    guarded = false;
    handler?.();
    guard(); // still a layer to close: keep the next Back in the game
  };
  const onUnload = (e: Event): void => {
    e.preventDefault();
    // older browsers show the prompt only when returnValue is set
    (e as { returnValue?: unknown }).returnValue = '';
  };

  return {
    native: false,
    setBack(cb) {
      if (cb === handler) return;
      handler = cb;
      if (!listening && env.window) {
        env.window.addEventListener('popstate', onPop);
        listening = true;
      }
      if (cb) guard();
      else if (guarded && env.window?.history) {
        guarded = false;
        skipPop++;
        env.window.history.back();
      }
    },
    setSettings() {
      /* no ⋯ menu on the web */
    },
    setClosingConfirmation(on) {
      if (on === confirming || !env.window) return;
      confirming = on;
      if (on) env.window.addEventListener('beforeunload', onUnload);
      else env.window.removeEventListener('beforeunload', onUnload);
    },
  };
}
