"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { loginAction, type AuthActionState } from "@/lib/actions/auth";
import { Alert, Button, InputField } from "@/components/ui";

const initialState: AuthActionState = {};

export function LoginForm({ callbackURL = "/" }: { callbackURL?: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="callbackURL" value={callbackURL} />
      {state.error && <Alert>{state.error}</Alert>}
      <InputField label="Email" name="email" type="email" autoComplete="email" placeholder="nama@email.com" maxLength={254} required />
      <InputField label="Password" name="password" type="password" autoComplete="current-password" placeholder="Masukkan password" minLength={8} maxLength={128} required />
      <Button type="submit" loading={pending} className="w-full">Masuk <ArrowRight size={17} aria-hidden="true" /></Button>
      <p className="m-0 flex items-center justify-center gap-1.5 text-center text-xs text-secondary"><LockKeyhole size={13} aria-hidden="true" /> Sesi aman, password tidak pernah ditampilkan.</p>
      <p className="m-0 text-center text-sm text-secondary">Belum punya akun? <Link href={`/register?callbackURL=${encodeURIComponent(callbackURL)}`} className="font-bold text-primary hover:text-primary-hover">Daftar gratis</Link></p>
    </form>
  );
}
