export const ROOT: string;
export function readText(path: string): string;
export function sameFile(a: string, b: string): boolean;
export function sourceFiles(dir: string): { path: string; text: string }[];
export function tempDir(): string;
export function removeDir(dir: string): void;
export function runNode(script: string, args: string[]): { status: number | null; out: string };
