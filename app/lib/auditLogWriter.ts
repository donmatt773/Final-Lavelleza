import AuditLog, { AuditActorRole, AuditEntityType } from '@/app/lib/AuditLog';
import { getSessionFromRequest } from '@/app/lib/auth';

type AuditEventInput = {
  action: string;
  entityType: AuditEntityType;
  entityId?: string;
  entityLabel: string;
  summary: string;
  changedFields?: string[];
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