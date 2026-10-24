"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { registerAction, type AuthActionState } from "@/lib/actions/auth";
import { Alert, Button, InputField } from "@/components/ui";

const initialState: AuthActionState = {};

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, initialState);

  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      {state.error && <Alert>{state.error}</Alert>}
      <InputField label="Nama lengkap" name="name" type="text" autoComplete="name" placeholder="Nama kamu" minLength={2} maxLength={120} required />
      <InputField label="Email" name="email" type="email" autoComplete="email" placeholder="nama@email.com" maxLength={254} required />
      <InputField label="Password" name="password" type="password" autoComplete="new-password" placeholder="Minimal 8 karakter" minLength={8} maxLength={128} required />
      <InputField label="Konfirmasi password" name="confirmPassword" type="password" autoComplete="new-password" placeholder="Ulangi password" minLength={8} maxLength={128} required />
      <p className="m-0 rounded-xl bg-soft px-3.5 py-3 text-xs leading-5 text-orange-950">Akun yang dibuat lewat pendaftaran selalu ber-role USER.</p>
      <Button type="submit" loading={pending} className="w-full">Buat akun <ArrowRight size={17} aria-hidden="true" /></Button>
      <p className="m-0 text-center text-sm text-secondary">Sudah punya akun? <Link href="/login" className="font-bold text-primary hover:text-primary-hover">Masuk</Link></p>
    </form>
  );
}
