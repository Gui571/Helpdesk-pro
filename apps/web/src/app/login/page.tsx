'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Headset, LockKeyhole, Mail } from 'lucide-react';
import { send } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await send('/auth/login', 'POST', Object.fromEntries(new FormData(event.currentTarget)));
      router.replace('/dashboard');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível entrar.');
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="brand"><span className="brand-icon"><Headset size={25} /></span><div><strong>HelpDesk Pro</strong><small>Central de atendimento</small></div></div>
        <h1>Entre na sua conta</h1>
        <p className="muted">Abra chamados e acompanhe o atendimento da equipe de TI.</p>
        <form onSubmit={submit} className="stack">
          <label>E-mail<span className="field"><Mail size={18} aria-hidden="true" /><input aria-label="E-mail" name="email" type="email" autoComplete="username" maxLength={254} required placeholder="seu@email.com" /></span></label>
          <label>Senha<span className="field"><LockKeyhole size={18} aria-hidden="true" /><input aria-label="Senha" name="password" type="password" autoComplete="current-password" maxLength={72} required /></span></label>
          {error && <p role="alert" className="error">{error}</p>}
          <button disabled={busy} className="primary">{busy ? 'Entrando…' : 'Entrar'} <ArrowRight size={18} aria-hidden="true" /></button>
        </form>
        <p className="footnote">Acesso fornecido pela administração de TI.</p>
      </section>
    </main>
  );
}
