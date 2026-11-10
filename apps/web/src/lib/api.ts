export type Role = 'ADMIN' | 'TECHNICIAN' | 'EMPLOYEE';
export type User = { id: string; name: string; email: string; role: Role };
export type ManagedUser = User & { active: boolean; createdAt: string };
export type Person = { id: string; name: string };
export type Category = Person;
export type Status = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Ticket = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  createdAt: string;
  dueAt: string | null;
  category: Category;
  requester: Person;
  assignee: Person | null;
};
export type TicketDetail = Ticket & {
  resolution: string | null;
  comments: Array<{ id: string; content: string; createdAt: string; author: Person }>;
  history: Array<{ id: string; action: string; detail: string | null; createdAt: string; actor: Person }>;
  actions: { assign: boolean; statuses: Status[]; setPriority: boolean; comment: boolean };
};
export type Overview = {
  total: number;
  overdue: number;
  byStatus: Partial<Record<Status, number>>;
  byPriority: Partial<Record<Priority, number>>;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, { ...init, credentials: 'same-origin', headers, cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = Array.isArray(data?.message) ? data.message.join(' • ') : data?.message;
    throw new ApiError(typeof message === 'string' ? message : `Erro HTTP ${response.status}`, response.status);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function send<T>(path: string, method: 'POST' | 'PATCH', body: object) {
  return api<T>(path, { method, body: JSON.stringify(body) });
}

export const statuses: Record<Status, string> = {
  OPEN: 'Aberto', IN_PROGRESS: 'Em atendimento', RESOLVED: 'Resolvido', CLOSED: 'Fechado',
};
export const priorities: Record<Priority, string> = {
  LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica',
};
export const roles: Record<Role, string> = { ADMIN: 'Administrador', TECHNICIAN: 'Técnico', EMPLOYEE: 'Solicitante' };

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
