// audit.ts — every mutation writes a row here (ideally inside the same transaction).

import type { DB } from './db/index';
import { nowIso } from './util';

export function writeAudit(
  db: DB,
  a: { entity: string; entityId: number; action: 'create' | 'update' | 'delete'; diff?: unknown },
): void {
  db.prepare('INSERT INTO audit_log (user_id, entity, entity_id, action, diff_json, created_at) VALUES (1, ?, ?, ?, ?, ?)').run(
    a.entity,
    a.entityId,
    a.action,
    a.diff === undefined ? null : JSON.stringify(a.diff),
    nowIso(),
  );
}
