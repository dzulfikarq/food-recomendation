import { z } from "zod";

export const registrationSchema = z.object({
  name: z.string().trim().min(2, "Name must have at least 2 characters.").max(120),
  email: z.string().trim().email("Enter a valid email.").max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8, "Password must have at least 8 characters.").max(128),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match."
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email.").max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1, "Enter your password.").max(128)
});
