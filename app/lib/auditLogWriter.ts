import AuditLog, { AuditActorRole, AuditEntityType, AuditFieldChange } from '@/app/lib/AuditLog';
import { getSessionFromRequest } from '@/app/lib/auth';

const SENSITIVE_FIELD_PATTERN = /password|secret|token|credential|reference|proof|email|phone|address|specialRequests/i;

function normalizeAuditValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeAuditValue);
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown> & { toHexString?: () => string; toObject?: () => Record<string, unknown> };
    if (typeof objectValue.toHexString === 'function') return objectValue.toHexString();
    if (typeof objectValue.toObject === 'function') return normalizeAuditValue(objectValue.toObject());
    return Object.fromEntries(Object.entries(objectValue).filter(([key]) => key !== '__v').map(([key, entry]) => [key, normalizeAuditValue(entry)]));
  }
  return String(value);
}

function formatAuditValue(value: unknown) {
  if (value === undefined) return '(not set)';
  if (value === null || value === '') return '(empty)';
  const normalized = normalizeAuditValue(value);
  const text = typeof normalized === 'string' ? normalized : JSON.stringify(normalized);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function diffAuditFields(
  before: unknown,
  after: unknown,
  fields: string[]
): AuditFieldChange[] {
  const toRecord = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object') return {};
    const document = value as { toObject?: () => unknown };
    const plainValue = typeof document.toObject === 'function' ? document.toObject() : value;
    return plainValue && typeof plainValue === 'object' ? plainValue as Record<string, unknown> : {};
  };
  const beforeRecord = toRecord(before);
  const afterRecord = toRecord(after);

  return fields
    .filter((field) => !SENSITIVE_FIELD_PATTERN.test(field))
    .flatMap((field) => {
      const beforeValue = normalizeAuditValue(beforeRecord[field]);
      const afterValue = normalizeAuditValue(afterRecord[field]);
      if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) return [];
      return [{ field, before: formatAuditValue(beforeRecord[field]), after: formatAuditValue(afterRecord[field]) }];
    });
}

type AuditEventInput = {
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel: string;
  summary: string;
  changedFields?: Array<string | AuditFieldChange>;
  actor?: {
    id?: string;
    name: string;
    employeeId?: string;
    role: AuditActorRole;
  };
};

export async function writeAuditLog(request: Request, event: AuditEventInput) {
  const session = getSessionFromRequest(request);
  const fallbackRole = request.headers.get('x-user-role');
  const actor = event.actor || (session
    ? {
        id: session.sub,
        name: session.name,
        employeeId: session.employeeId,
        role: session.role === 0 ? 'OWNER' as const : 'STAFF' as const,
      }
    : {
        name: request.headers.get('x-user-name') || request.headers.get('x-user-id') || 'Unknown user',
        role: fallbackRole === '0' ? 'OWNER' as const : fallbackRole === '1' ? 'STAFF' as const : 'SYSTEM' as const,
      });

  try {
    await AuditLog.create({
      actorId: actor.id,
      actorName: actor.name,
      actorEmployeeId: actor.employeeId,
      actorRole: actor.role,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      entityLabel: event.entityLabel,
      summary: event.summary,
      changedFields: event.changedFields || [],
    });
  } catch (error) {
    console.error('AUDIT LOG WRITE ERROR:', error);
  }
}