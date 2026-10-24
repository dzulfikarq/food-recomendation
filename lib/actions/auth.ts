"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";

export type AuthActionState = { error?: string };

export async function registerAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = registrationSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: input.error.issues[0]?.message ?? "Check your registration details." };

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
    return { error: "Could not create account. Check your details or try another email." };
  }

  redirect("/");
}

export async function loginAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = loginSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Enter a valid email and password." };

  let redirectPath = "/";
  try {
    const result = await auth.api.signInEmail({
      body: { email: input.data.email, password: input.data.password },
      headers: await headers()
    });
    if (result.user.role === "ADMIN") redirectPath = "/admin";
  } catch {
    return { error: "Email or password is incorrect." };
  }

  redirect(redirectPath);
}

export async function logoutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
