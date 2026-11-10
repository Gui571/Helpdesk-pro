'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, priorities, send, statuses, type Person, type Status, type TicketDetail } from '@/lib/api';
import { useCurrentUser } from '@/lib/session';

const eventLabels: Record<string, string> = {
  CREATED: 'Abriu o chamado',
  ASSIGNEE_CHANGED: 'Alterou o responsável',
  STATUS_CHANGED: 'Alterou o status',
  PRIORITY_CHANGED: 'Alterou a prioridade',
};

const statusLabels: Record<Status, string> = {
  OPEN: 'Voltar para a fila',
  IN_PROGRESS: 'Iniciar atendimento',
  RESOLVED: 'Registrar solução',
  CLOSED: 'Confirmar e fechar',
};

export default function TicketDetailPage() {
  const user = useCurrentUser();
  const { id } = useParams<{ id: string }>();
  const path = `/tickets/${id}`;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [staff, setStaff] = useState<Person[]>([]);
  const [error, setError] = useState('');
  const [staffError, setStaffError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    const detail = await api<TicketDetail>(path, { signal });
    if (!signal?.aborted) setTicket(detail);
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();
    setTicket(null);
    setError('');
    load(controller.signal).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    if (user.role === 'ADMIN') {
      api<Person[]>('/users/technicians', { signal: controller.signal })
        .then(setStaff)
        .catch(() => { if (!controller.signal.aborted) setStaffError('Não foi possível listar a equipe de TI.'); });
    }
    return () => controller.abort();
  }, [load, user.role]);

  async function save(endpoint: string, method: 'PATCH' | 'POST', body: object) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await send(path + endpoint, method, body);
      setNotice('Atualização salva.');
      await load();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao atualizar o chamado.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, endpoint: string, field: string, extra: object = {}) {
    event.preventDefault();
    const form = event.currentTarget;
    const value = new FormData(form).get(field);
    save(endpoint, endpoint === '/comments' ? 'POST' : 'PATCH', { [field]: value || null, ...extra })
      .then((ok) => { if (ok && endpoint === '/comments') form.reset(); });
  }

  return (
    <>
      <Link className="back" href="/dashboard/tickets">← Voltar para chamados</Link>
      {error && <div className="error" role="alert">{error} {ticket && <button onClick={() => window.location.reload()}>Recarregar</button>}</div>}
      {notice && <p className="success" role="status">{notice}</p>}
      {!ticket && !error && <p role="status">Carregando chamado…</p>}
      {ticket && (
        <>
          <header className="topline">
            <div><p className="eyebrow">CHAMADO #{ticket.id.slice(-8).toUpperCase()}</p><h1>{ticket.title}</h1><p className="muted">Aberto por {ticket.requester.name} em {formatDate(ticket.createdAt)}</p></div>
            <span className={`status ${ticket.status.toLowerCase()}`}>{statuses[ticket.status]}</span>
          </header>
          <div className="detail-grid">
            <div className="section-stack">
              <section className="panel padded">
                <h2>Descrição</h2><p className="multiline">{ticket.description}</p>
                {ticket.resolution && <div className="solution"><h3>Solução registrada</h3><p className="multiline">{ticket.resolution}</p></div>}
              </section>
              <section className="panel padded">
                <h2>Comentários</h2>
                {ticket.actions.comment && <form className="stack clean" onSubmit={(event) => submit(event, '/comments', 'content')}>
                  <label>Nova mensagem<textarea name="content" required maxLength={2000} rows={3} /></label>
                  <button className="secondary" disabled={busy}>Enviar comentário</button>
                </form>}
                {!ticket.comments.length && <p className="muted">Nenhum comentário registrado.</p>}
                <ul className="timeline">{ticket.comments.map((comment) => <li key={comment.id}><strong>{comment.author.name}</strong><small>{formatDate(comment.createdAt)}</small><p className="multiline">{comment.content}</p></li>)}</ul>
              </section>
              <section className="panel padded">
                <h2>Histórico de alterações</h2>
                <ul className="timeline">{ticket.history.map((event) => <li key={event.id}><strong>{event.actor.name} · {eventLabels[event.action] ?? event.action}</strong><small>{formatDate(event.createdAt)}</small>{event.detail && <p>{event.detail}</p>}</li>)}</ul>
              </section>
            </div>
            <div className="section-stack">
              <section className="panel padded">
                <h2>Informações</h2>
                <dl className="facts">
                  <div><dt>Categoria</dt><dd>{ticket.category.name}</dd></div>
                  <div><dt>Prioridade</dt><dd>{priorities[ticket.priority]}</dd></div>
                  <div><dt>Responsável</dt><dd>{ticket.assignee?.name ?? 'Sem responsável'}</dd></div>
                  <div><dt>Prazo SLA</dt><dd>{ticket.dueAt ? formatDate(ticket.dueAt) : '—'}</dd></div>
                </dl>
              </section>
              {(ticket.actions.assign || ticket.actions.setPriority || ticket.actions.statuses.length > 0) && (
                <section className="panel padded section-stack">
                  <h2>Ações do atendimento</h2>
                  {ticket.actions.assign && (user.role === 'ADMIN' ? (
                    <form key={ticket.assignee?.id ?? 'unassigned'} className="stack clean" onSubmit={(event) => submit(event, '/assignee', 'assigneeId')}>
                      <label>Responsável<select name="assigneeId" defaultValue={ticket.assignee?.id ?? ''}>
                        {ticket.status === 'OPEN' && <option value="">Sem responsável</option>}
                        {ticket.assignee && !staff.some(({ id }) => id === ticket.assignee?.id) && <option value={ticket.assignee.id} disabled>{ticket.assignee.name} (atual)</option>}
                        {staff.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                      </select></label>
                      {staffError && <p role="alert" className="error">{staffError}</p>}
                      <button className="secondary" disabled={busy || !staff.length}>Salvar responsável</button>
                    </form>
                  ) : <button className="primary" disabled={busy} onClick={() => save('/assignee', 'PATCH', { assigneeId: user.id })}>Assumir chamado</button>)}
                  {ticket.actions.setPriority && <form key={ticket.priority} className="stack clean" onSubmit={(event) => submit(event, '/priority', 'priority')}>
                    <label>Prioridade<select name="priority" defaultValue={ticket.priority}>{Object.entries(priorities).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
                    <button className="secondary" disabled={busy}>Salvar prioridade</button>
                  </form>}
                  {ticket.actions.statuses.map((status) => status === 'RESOLVED' ? (
                    <form key={status} className="stack clean" onSubmit={(event) => submit(event, '/status', 'resolution', { status })}>
                      <label>Solução<textarea name="resolution" rows={3} required minLength={10} maxLength={4000} /></label>
                      <button className="primary" disabled={busy}>{statusLabels[status]}</button>
                    </form>
                  ) : <button key={status} className="secondary" disabled={busy} onClick={() => save('/status', 'PATCH', { status })}>{ticket.status === 'RESOLVED' && status !== 'CLOSED' ? 'Reabrir chamado' : statusLabels[status]}</button>)}
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
