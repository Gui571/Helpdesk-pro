export type RoleName = 'ADMIN' | 'TECHNICIAN' | 'EMPLOYEE';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type PriorityName = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Actor = { id: string; role: RoleName };
type TicketState = { status: Status; requesterId: string; assigneeId: string | null };

const SLA_HOURS: Record<PriorityName, number> = {
  LOW: 72,
  MEDIUM: 24,
  HIGH: 12,
  CRITICAL: 4,
};

export function slaDeadline(createdAt: Date, priority: PriorityName) {
  return new Date(createdAt.getTime() + SLA_HOURS[priority] * 3_600_000);
}

export function canWorkOn(actor: Actor, ticket: TicketState) {
  return actor.role === 'ADMIN' || (actor.role === 'TECHNICIAN' && ticket.assigneeId === actor.id);
}

export function canAssign(actor: Actor, ticket: TicketState, targetId: string | null) {
  if (ticket.status !== 'OPEN' && ticket.status !== 'IN_PROGRESS') return false;
  if (ticket.status === 'IN_PROGRESS' && !targetId) return false;
  return actor.role === 'ADMIN' ||
    (actor.role === 'TECHNICIAN' && ticket.assigneeId === null && targetId === actor.id);
}

export function transitionOptions(actor: Actor, ticket: TicketState): Status[] {
  const isRequester = actor.id === ticket.requesterId;
  const canWork = canWorkOn(actor, ticket);
  switch (ticket.status) {
    case 'OPEN':
      return canWork && ticket.assigneeId ? ['IN_PROGRESS'] : [];
    case 'IN_PROGRESS':
      return canWork ? ['RESOLVED', 'OPEN'] : [];
    case 'RESOLVED':
      return isRequester || actor.role === 'ADMIN' ? ['CLOSED', ticket.assigneeId ? 'IN_PROGRESS' : 'OPEN'] : [];
    case 'CLOSED':
      return [];
  }
}

export function ticketScope(actor: Actor) {
  if (actor.role === 'EMPLOYEE') return { requesterId: actor.id };
  if (actor.role === 'TECHNICIAN') {
    return { OR: [{ requesterId: actor.id }, { assigneeId: actor.id }, { assigneeId: null }] };
  }
  return {};
}
