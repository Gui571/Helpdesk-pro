'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Headset, LayoutDashboard, LogOut, Ticket, Users } from 'lucide-react';
import { api, ApiError, roles, type User } from '@/lib/api';

import { CurrentUser } from '@/lib/session';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api<{ user: User }>('/auth/me', { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) router.replace('/login');
        else setError('Não foi possível acessar o servidor.');
      });
    return () => controller.abort();
  }, [router]);

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api<void>('/auth/logout', { method: 'POST' });
      setUser(null);
      router.replace('/login');
    } catch {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <main className="center">{error ? <div role="alert">{error} <button onClick={() => window.location.reload()}>Recarregar</button></div> : <p role="status">Carregando sessão…</p>}</main>;

  const links = [
    { href: '/dashboard', text: 'Visão geral', icon: LayoutDashboard },
    { href: '/dashboard/tickets', text: 'Chamados', icon: Ticket },
    ...(user.role === 'ADMIN' ? [{ href: '/dashboard/users', text: 'Usuários', icon: Users }] : []),
  ];

  return (
    <CurrentUser.Provider value={user}>
      <div className="layout">
        <aside className="sidebar">
          <Link className="brand" href="/dashboard">
            <span className="brand-icon"><Headset size={23} /></span>
            <span><strong>HelpDesk Pro</strong><small>Central de atendimento</small></span>
          </Link>
          <nav aria-label="Menu principal">
            {links.map(({ href, text, icon: Icon }) => {
              const selected = href === '/dashboard' ? pathname === href : pathname.startsWith(href);
              return <Link key={href} href={href} className={selected ? 'nav-active' : ''} aria-current={selected ? 'page' : undefined}><Icon size={19} />{text}</Link>;
            })}
          </nav>
          <div className="profile">
            <span className="avatar">{user.name[0]}</span>
            <span><strong>{user.name}</strong><small>{roles[user.role]}</small></span>
            <button disabled={busy} aria-label="Sair" title="Sair" onClick={logout}><LogOut size={18} /></button>
          </div>
        </aside>
        <main className="content">
          {error && <p className="error" role="alert">{error}</p>}
          {children}
        </main>
      </div>
    </CurrentUser.Provider>
  );
}
