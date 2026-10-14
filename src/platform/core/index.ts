/** The platform interfaces (ADR-0006). Types only: no runtime code, no globals. */
export type { Platform, PlatformId, ClientInfo } from './platform';
export type { Auth, AuthMethod, AuthProof, HumanCheck, HumanCheckAction, HumanCheckFailure, HumanCheckState, HumanCheckWidget } from './auth';
export type { Payments, PaymentStatus, PaymentResult } from './payments';
export type { Storage, KV } from './storage';
export type { Haptics, ImpactStyle, NotifyType } from './haptics';
export type { BackButton } from './back';
export type { Share, ShareResult } from './share';
export type { SafeArea, Insets } from './safeArea';
export type { InputHints } from './input';
export type { Notifications, NotificationChannel } from './notifications';
export type { PlatformEnv } from './env';
