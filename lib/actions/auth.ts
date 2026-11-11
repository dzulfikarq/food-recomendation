"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { safeUserCallbackPath } from "@/lib/auth-redirect";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";

export type AuthActionState = { error?: string };

export async function registerAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Periksa kembali data pendaftaran." };

  try {
    await auth.api.signUpEmail({
      body: {
        name: input.data.name,
        email: input.data.email,
        password: input.data.password
      },
      headers: await headers()
    });
  } catch {
    return { error: "Akun tidak dapat dibuat. Periksa data atau gunakan email lain." };
  }

  redirect(safeUserCallbackPath(formData.get("callbackURL")));
}

export async function loginAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = loginSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Masukkan email dan password yang valid." };

  let redirectPath = safeUserCallbackPath(formData.get("callbackURL"));
  try {
    const result = await auth.api.signInEmail({
      body: { email: input.data.email, password: input.data.password },
      headers: await headers()
    });
    if (result.user.role === "ADMIN") redirectPath = "/admin";
  } catch {
    return { error: "Email atau password salah." };
  }

  redirect(redirectPath);
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
