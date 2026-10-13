/**
 * Back on the web: the browser's (and Android's) Back pops a guard history
 * entry, which runs the game's back callback instead of leaving the page.
 * A guard entry is pushed when a callback is set and none is in place. It is
 * never removed with history.back(): that call is asynchronous and races the
 * next pushState, which could leave the page. So after the last layer closes
 * one Back press may do nothing; the next leaves. Escape is not handled here:
 * it belongs to the input layer, which calls nav.back().
 */
import type { BackButton } from '../core/back';
import type { PlatformEnv } from '../core/env';

export function createWebBack(env: PlatformEnv): BackButton {
  let handler: (() => void) | null = null;
  let guarded = false;
  let listening = false;
  let confirming = false;

  const guard = (): void => {
    if (guarded || !handler || !env.window?.history) return;
    env.window.history.pushState({ pixelarrow: 'back' }, '');
    guarded = true;
  };
  const onPop = (): void => {
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
      guard();
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
