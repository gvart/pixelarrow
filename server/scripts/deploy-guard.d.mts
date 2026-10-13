export declare const DEV_ONLY_VARS: string[];
export declare function devVarsIn(config: { vars?: Record<string, unknown>; env?: Record<string, { vars?: Record<string, unknown> }> }): string[];
