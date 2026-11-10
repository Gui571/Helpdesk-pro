'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, send, priorities, type Category } from '@/lib/api';
import { useCurrentUser } from '@/lib/session';

export default function NewTicketPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<Category[]>('/categories', { signal: controller.signal }).then(setCategories).catch((error: Error) => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const ticket = await send<{ id: string }>('/tickets', 'POST', data);
      router.push(`/dashboard/tickets/${ticket.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível abrir o chamado.');
      setBusy(false);
    }
  }

  return (
    <>
      <Link className="back" href="/dashboard/tickets">← Voltar para chamados</Link>
      <header className="topline"><div><h1>Novo chamado</h1><p className="muted">Descreva o problema e informe onde ele ocorre.</p></div></header>
      <section className="panel padded form-panel">
        <form className="stack clean" onSubmit={submit}>
          <label>Título<input name="title" required minLength={5} maxLength={120} placeholder="Ex. Impressora aparece offline" /></label>
          <label>Descrição<textarea name="description" required minLength={10} maxLength={5000} rows={6} placeholder="Informe o equipamento, setor e o que você já tentou." /></label>
          <div className="two-fields">
            <label>Categoria<select name="categoryId" required>{!categories.length && <option value="">Categorias indisponíveis</option>}{categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>
            <label>Prioridade<select name="priority" defaultValue="MEDIUM">{Object.entries(priorities).filter(([key]) => key !== 'CRITICAL' || user.role !== 'EMPLOYEE').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary" disabled={busy || !categories.length}>{busy ? 'Abrindo…' : 'Abrir chamado'}</button>
        </form>
      </section>
    </>
  );
}
