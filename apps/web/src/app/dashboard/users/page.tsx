'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, roles, send, type ManagedUser } from '@/lib/api';
import { useCurrentUser } from '@/lib/session';

export default function UsersPage() {
  const currentUser = useCurrentUser();
  if (currentUser.role !== 'ADMIN') return <p>Acesso reservado à administração. <Link className="back" href="/dashboard">Voltar</Link></p>;
  return <UserDirectory />;
}

function UserDirectory() {
  const [result, setResult] = useState<{ users: ManagedUser[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ search, page: String(page) });
    setLoading(true);
    setListError('');
    api<NonNullable<typeof result>>(`/users?${query}`, { signal: controller.signal }).then(setResult)
      .catch((error: Error) => { if (!controller.signal.aborted) setListError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, page, reload]);

  async function save(path: string, method: 'POST' | 'PATCH', data: object, success: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await send(path, method, data);
      setReload((value) => value + 1);
      setNotice(success);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao salvar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await save('/users', 'POST', Object.fromEntries(new FormData(form)), 'Conta criada.')) form.reset();
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(String(new FormData(event.currentTarget).get('search') ?? '').trim());
    setPage(1);
  }

  return (
    <>
      <header className="topline"><div><p className="eyebrow">ADMINISTRAÇÃO</p><h1>Usuários</h1><p className="muted">Cadastre contas de solicitantes e técnicos e gerencie seu acesso.</p></div></header>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="success">{notice}</p>}
      <div className="detail-grid">
        <section className="panel">
          <form className="filters directory-filter" onSubmit={filter}><label>Buscar usuário<input name="search" maxLength={100} placeholder="Nome ou e-mail" /></label><button className="secondary">Buscar</button></form>
          {listError && <p role="alert" className="error">{listError}</p>}
          {loading && <p className="empty" role="status">Carregando usuários…</p>}
          {!loading && !listError && result && <>
            {result.users.length ? <div className="table-wrap"><table><thead><tr><th>Conta</th><th>Perfil</th><th>Acesso</th><th>Ação</th></tr></thead>
              <tbody>{result.users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{roles[user.role]}</td><td>{user.active ? 'Ativo' : 'Inativo'}</td><td>
                {user.role !== 'ADMIN' && <button className="secondary" disabled={busy} onClick={() => save(`/users/${user.id}/active`, 'PATCH', { active: !user.active }, user.active ? 'Acesso desativado.' : 'Acesso reativado.')}>{user.active ? 'Desativar' : 'Reativar'}</button>}
              </td></tr>)}</tbody></table></div> : <p className="empty">Nenhum usuário encontrado.</p>}
            <div className="pagination"><span>{result.total} usuário(s)</span><div><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * result.pageSize >= result.total} onClick={() => setPage(page + 1)}>Próxima</button></div></div>
          </>}
        </section>
        <section className="panel padded">
          <h2>Nova conta</h2>
          <form className="stack clean" onSubmit={create}>
            <label>Nome<input name="name" required minLength={2} maxLength={100} /></label>
            <label>E-mail<input name="email" type="email" required maxLength={254} /></label>
            <label>Senha inicial<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} /></label>
            <label>Perfil<select name="role"><option value="EMPLOYEE">Solicitante</option><option value="TECHNICIAN">Técnico</option></select></label>
            <button className="primary" disabled={busy}>Criar usuário</button>
          </form>
        </section>
      </div>
    </>
  );
}
