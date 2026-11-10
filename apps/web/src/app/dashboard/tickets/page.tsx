'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { api, formatDate, priorities, statuses, type Category, type Ticket } from '@/lib/api';

export default function TicketsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [result, setResult] = useState<{ tickets: Ticket[]; total: number; pageSize: number } | null>(null);
  const [filters, setFilters] = useState({ search: '', status: '', priority: '', categoryId: '' });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    api<Category[]>('/categories', { signal: controller.signal }).then(setCategories).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page) });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    setLoading(true);
    setError('');
    api<NonNullable<typeof result>>(`/tickets?${query}`, { signal: controller.signal })
      .then(setResult)
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPage(1);
    setFilters({
      search: String(fields.get('search') ?? '').trim(),
      status: String(fields.get('status') ?? ''),
      priority: String(fields.get('priority') ?? ''),
      categoryId: String(fields.get('categoryId') ?? ''),
    });
  }

  return (
    <>
      <header className="topline"><div><p className="eyebrow">FILA DE ATENDIMENTO</p><h1>Chamados</h1><p className="muted">Filtre solicitações e abra o histórico de atendimento.</p></div><Link className="primary add" href="/dashboard/tickets/new"><Plus size={18} /> Novo chamado</Link></header>
      <section className="panel">
        <form className="filters" onSubmit={apply}>
          <label>Busca<input name="search" maxLength={120} placeholder="Título ou descrição" /></label>
          <label>Status<select name="status"><option value="">Todos</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Prioridade<select name="priority"><option value="">Todas</option>{Object.entries(priorities).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Categoria<select name="categoryId"><option value="">Todas</option>{categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
          <button className="secondary">Filtrar</button>
        </form>
        {error && <p role="alert" className="error">{error}</p>}
        {loading && <p role="status" className="empty">Carregando chamados…</p>}
        {!loading && !error && result && (
          <>
            {result.tickets.length ? (
              <div className="table-wrap"><table>
                <thead><tr><th>Chamado</th><th>Categoria</th><th>Prioridade</th><th>Status</th><th>Prazo SLA</th></tr></thead>
                <tbody>{result.tickets.map((ticket) => {
                  const overdue = ticket.dueAt && Date.parse(ticket.dueAt) < Date.now() && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS');
                  return <tr key={ticket.id}>
                    <td><Link className="ticket-link" href={`/dashboard/tickets/${ticket.id}`}>{ticket.title}</Link><small>{ticket.requester.name} · {ticket.assignee?.name ?? 'Sem responsável'}</small></td>
                    <td>{ticket.category.name}</td><td><span className={`priority ${ticket.priority.toLowerCase()}`}>{priorities[ticket.priority]}</span></td>
                    <td><span className={`status ${ticket.status.toLowerCase()}`}>{statuses[ticket.status]}</span></td>
                    <td>{ticket.dueAt ? formatDate(ticket.dueAt) : '—'}{overdue && <small className="overdue">Vencido</small>}</td>
                  </tr>;
                })}</tbody>
              </table></div>
            ) : <p className="empty">Nenhum chamado encontrado para esses filtros.</p>}
            <div className="pagination"><span>{result.total} chamado(s)</span><div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <span>Página {page}</span>
              <button disabled={page * result.pageSize >= result.total} onClick={() => setPage(page + 1)}>Próxima</button>
            </div></div>
          </>
        )}
      </section>
    </>
  );
}
