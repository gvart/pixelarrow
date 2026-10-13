/**
 * The shared contract every Platform adapter meets (ADR-0006 "Testing"). Each
 * adapter's test file runs it with a harness: the adapter after init(), plus
 * drivers for the platform events the contract needs.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Platform } from '../../src/platform/core/index';

export interface ContractHarness {
  p: Platform;
  /** The platform's Back gesture or button. */
  pressBack(): void;
  /** The platform reports new safe-area insets. */
  changeInsets(): void;
}

export function platformContract(name: string, make: () => Promise<ContractHarness>): void {
  describe(`${name}: platform contract`, () => {
    it('plays haptics without throwing, enabled or not', async () => {
      const { p } = await make();
      for (const on of [true, false]) {
        p.haptics.setEnabled(on);
        expect(() => (p.haptics.impact('light'), p.haptics.impact('heavy'), p.haptics.notify('error'), p.haptics.select())).not.toThrow();
      }
    });

    it('runs the Back callback, and setBack(null) clears it', async () => {
      const h = await make();
      const cb = vi.fn();
      h.p.back.setBack(cb);
      h.pressBack();
      expect(cb).toHaveBeenCalledOnce();
      h.p.back.setBack(null);
      h.pressBack();
      expect(cb).toHaveBeenCalledOnce();
      expect(typeof h.p.back.native).toBe('boolean');
      expect(() => (h.p.back.setSettings(() => {}), h.p.back.setSettings(null), h.p.back.setClosingConfirmation(true), h.p.back.setClosingConfirmation(false))).not.toThrow();
    });

    it('share.invite resolves to shared, copied or failed', async () => {
      const { p } = await make();
      expect(['shared', 'copied', 'failed']).toContain(await p.share.invite('https://play.pixelarrow.app/?startapp=clan_X', 'Join'));
      expect(p.share.inviteUrl('clan_X')).toMatch(/^https:\/\/.*startapp=clan_X$/);
    });

    it('payments.status() is well-formed', async () => {
      const s = (await make()).p.payments.status();
      if (s.available) expect(s.provider).toBe('telegram_stars');
      else expect(['coming_soon', 'signed_out', 'offline']).toContain(s.reason);
    });

    it('storage.save() and storage.device() round-trip a value', async () => {
      const { p } = await make();
      for (const kv of [p.storage.save(), p.storage.device()]) {
        await kv.set('contract', 'v');
        expect(await kv.get('contract')).toBe('v');
        await kv.remove('contract');
        expect(await kv.get('contract')).toBeNull();
      }
    });

    it('safeArea.onChange unsubscribes', async () => {
      const h = await make();
      const cb = vi.fn();
      const off = h.p.safeArea.onChange(cb);
      off();
      h.changeInsets();
      expect(cb).not.toHaveBeenCalled();
      const { device, content } = h.p.safeArea.current();
      for (const s of ['top', 'bottom', 'left', 'right'] as const) expect(device[s] >= 0 && content[s] >= 0).toBe(true);
    });

    it('auth, input, notifications, launch and client answer with the right shapes', async () => {
      const { p } = await make();
      expect(['bearer', 'cookie']).toContain(p.auth.transport);
      expect(Array.isArray(p.auth.methods())).toBe(true);
      const proof = p.auth.silentProof();
      if (proof) expect(proof.kind).toBe('telegram');
      expect(typeof p.input.keyboard()).toBe('boolean');
      expect(typeof p.input.finePointer()).toBe('boolean');
      p.input.onChange(() => {})();
      const labels = await p.input.keyLabels();
      expect(labels === null || labels instanceof Map).toBe(true);
      expect(Array.isArray(p.notifications.channels())).toBe(true);
      const lp = p.launchParam();
      expect(lp === null || typeof lp === 'string').toBe(true);
      expect(typeof p.client().platform).toBe('string');
      p.onActive(() => {})();
    });
  });
}
