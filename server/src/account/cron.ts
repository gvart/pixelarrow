/**
 * Daily housekeeping for linking (ADR-0009 §3, §5.5): link codes live 10
 * minutes and conflicts 15; the rows past that are pruned here.
 */
export async function pruneLinks(db: D1Database, now = Date.now()): Promise<{ codes: number; conflicts: number }> {
  const [codes, conflicts] = await db.batch([
    db.prepare('DELETE FROM link_codes WHERE expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM link_conflicts WHERE expires_at <= ?1').bind(now),
  ]);
  return { codes: codes.meta.changes ?? 0, conflicts: conflicts.meta.changes ?? 0 };
}
