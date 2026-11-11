import type { Metadata } from "next";
import { redirectAuthenticatedUser } from "@/lib/authz";
import { safeUserCallbackPath } from "@/lib/auth-redirect";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ callbackURL?: string | string[] }> }) {
  await redirectAuthenticatedUser();
  const callbackURL = safeUserCallbackPath((await searchParams).callbackURL);
  return (
    <>
      <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">MULAI DI SINI</p>
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">Buat akun FoodRec</h1>
      <p className="mb-7 text-sm leading-6 text-secondary">Bergabung untuk membantu FoodRec memahami pola selera.</p>
      <RegisterForm callbackURL={callbackURL} />
    </>
  );
}
