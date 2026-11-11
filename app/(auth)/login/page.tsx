import type { Metadata } from "next";
import { redirectAuthenticatedUser } from "@/lib/authz";
import { safeUserCallbackPath } from "@/lib/auth-redirect";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackURL?: string | string[] }> }) {
  await redirectAuthenticatedUser();
  const callbackURL = safeUserCallbackPath((await searchParams).callbackURL);
  return (
    <>
      <p className="mb-2 text-xs font-bold uppercase tracking-[.18em] text-primary">SELAMAT DATANG KEMBALI</p>
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">Masuk ke FoodRec</h1>
      <p className="mb-8 text-sm leading-6 text-secondary">Lanjutkan perjalanan mengenal preferensi makanan kamu.</p>
      <LoginForm callbackURL={callbackURL} />
    </>
  );
}
