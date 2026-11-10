'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlarmClock, CheckCircle2, Clock3, Plus, Ticket } from 'lucide-react';
import { api, priorities, statuses, type Overview, type Priority, type Status } from '@/lib/api';

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Overview>('/tickets/overview', { signal: controller.signal }).then(setOverview).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, []);

  const cards = [
    { name: 'Total visível', value: overview?.total, icon: Ticket },
    { name: 'Em atendimento', value: overview?.byStatus.IN_PROGRESS ?? (overview ? 0 : null), icon: Clock3 },
    { name: 'Resolvidos e fechados', value: overview && (overview.byStatus.RESOLVED ?? 0) + (overview.byStatus.CLOSED ?? 0), icon: CheckCircle2 },
    { name: 'SLA vencido', value: overview?.overdue, icon: AlarmClock },
  ];
  return (
    <>
      <header className="topline">
        <div><p className="eyebrow">CENTRAL DE ATENDIMENTO</p><h1>Visão geral</h1><p className="muted">Indicadores dos chamados que seu perfil pode consultar.</p></div>
        <Link className="primary add" href="/dashboard/tickets/new"><Plus size={18} /> Novo chamado</Link>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {!error && !overview && <p role="status">Carregando indicadores…</p>}
      {overview && (
        <>
          <div className="stats">{cards.map(({ name, value, icon: Icon }) => <div className="stat" key={name}><span className="stat-icon"><Icon size={21} /></span><p>{name}</p><strong>{value ?? '—'}</strong></div>)}</div>
          <div className="overview-grid">
            <section className="panel padded"><h2>Por status</h2>
              {(Object.keys(statuses) as Status[]).map((status) => <Metric key={status} name={statuses[status]} value={overview.byStatus[status] ?? 0} total={overview.total} />)}
            </section>
            <section className="panel padded"><h2>Por prioridade</h2>
              {(Object.keys(priorities) as Priority[]).map((priority) => <Metric key={priority} name={priorities[priority]} value={overview.byPriority[priority] ?? 0} total={overview.total} />)}
            </section>
          </div>
          <Link className="secondary page-link" href="/dashboard/tickets">Abrir lista de chamados →</Link>
        </>
      )}
    </>
  );
}

function Metric({ name, value, total }: { name: string; value: number; total: number }) {
  return <div className="metric"><div><span>{name}</span><strong>{value}</strong></div><progress aria-label={name} max={total || 1} value={value} /></div>;
}
