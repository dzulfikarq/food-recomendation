import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Nama harus terdiri dari minimal 2 karakter.").max(120),
  email: z.string().trim().email("Masukkan alamat email yang valid.").max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8, "Password harus terdiri dari minimal 8 karakter.").max(128),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Konfirmasi password tidak cocok."
});

export const loginSchema = z.object({
  email: z.string().trim().email("Masukkan alamat email yang valid.").max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1, "Masukkan password.").max(128)
});
