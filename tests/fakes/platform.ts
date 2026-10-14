/**
 * A Platform for game-code tests: install it with setPlatformForTests(new
 * FakePlatform()) and read what the game did (haptic cues, back callbacks,
 * shares, payments). Every capability can be tuned through its fields.
 */
import type { AuthMethod, AuthProof, Insets, KV, PaymentResult, PaymentStatus, Platform, ShareResult } from '../../src/platform/core/index';

export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const ZERO: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

export class FakePlatform implements Platform {
  readonly id = 'web' as const;
  /** Every haptic cue played, as 'impact:light', 'notify:error', 'select'. */
  readonly cues: string[] = [];
  readonly shares: { url: string; text: string }[] = [];
  readonly paid: { link: string }[] = [];
  readonly opened: string[] = [];
  backCb: (() => void) | null = null;
  settingsCb: (() => void) | null = null;
  closingConfirmation = false;
  hapticsOn = true;
  authMethods: AuthMethod[] = [];
  proof: AuthProof | null = null;
  payStatus: PaymentStatus = { available: false, reason: 'coming_soon' };
  payResult: PaymentResult = 'paid';
  shareResult: ShareResult = 'copied';
  launch: string | null = null;
  insets = { device: { ...ZERO }, content: { ...ZERO } };
  keyboardOn = false;
  readonly saveKV = memoryKV();
  readonly deviceKV = memoryKV();
  private readonly activeSubs = new Set<(a: boolean) => void>();
  private readonly insetSubs = new Set<(d: Insets, c: Insets) => void>();
  private readonly inputSubs = new Set<() => void>();
  inits = 0;

  async init(): Promise<void> {
    this.inits++;
  }

  readonly auth = {
    transport: 'cookie' as const,
    methods: () => this.authMethods,
    silentProof: () => this.proof,
  };

  readonly payments = {
    status: () => this.payStatus,
    pay: async (invoice: { link: string }) => {
      this.paid.push({ link: invoice.link });
      return this.payResult;
    },
  };

  /** Where save() and device() point; a test may swap in its own stores. */
  saveStore: () => KV = () => this.saveKV;
  deviceStore: () => KV = () => this.deviceKV;
  readonly storage = { save: () => this.saveStore(), device: () => this.deviceStore(), roams: false };

  readonly haptics = {
    impact: (s: string) => void (this.hapticsOn && this.cues.push(`impact:${s}`)),
    notify: (t: string) => void (this.hapticsOn && this.cues.push(`notify:${t}`)),
    select: () => void (this.hapticsOn && this.cues.push('select')),
    setEnabled: (on: boolean) => void (this.hapticsOn = on),
  };

  /** Set back.native = true to act like a platform with its own Back control. */
  readonly back = {
    native: false,
    setBack: (cb: (() => void) | null) => void (this.backCb = cb),
    setSettings: (cb: (() => void) | null) => void (this.settingsCb = cb),
    setClosingConfirmation: (on: boolean) => void (this.closingConfirmation = on),
  };

  readonly share = {
    inviteUrl: (param: string) => `https://play.pixelarrow.app/?startapp=${param}`,
    invite: async (url: string, text: string) => {
      this.shares.push({ url, text });
      return this.shareResult;
    },
    openExternal: (url: string) => (this.opened.push(url), true),
  };

  readonly safeArea = {
    current: () => this.insets,
    onChange: (cb: (d: Insets, c: Insets) => void) => (this.insetSubs.add(cb), () => void this.insetSubs.delete(cb)),
  };

  readonly input = {
    keyboard: () => this.keyboardOn,
    finePointer: () => this.keyboardOn,
    onChange: (cb: () => void) => (this.inputSubs.add(cb), () => void this.inputSubs.delete(cb)),
    keyLabels: async () => null,
  };

  readonly notifications = { channels: () => [] };

  onActive(cb: (active: boolean) => void): () => void {
    this.activeSubs.add(cb);
    return () => void this.activeSubs.delete(cb);
  }

  launchParam(): string | null {
    return this.launch;
  }

  client() {
    return { platform: 'fake' };
  }

  /** Test drivers. */
  pressBack(): void {
    this.backCb?.();
  }
  setActive(active: boolean): void {
    this.activeSubs.forEach((cb) => cb(active));
  }
  setInsets(device: Insets, content: Insets = { ...ZERO }): void {
    this.insets = { device, content };
    this.insetSubs.forEach((cb) => cb(device, content));
  }
  pressKey(): void {
    this.keyboardOn = true;
    this.inputSubs.forEach((cb) => cb());
  }
}
