import "server-only";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { readApplicationEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const env = readApplicationEnvironment();

export const auth = betterAuth({
  appName: "FoodRec",
  baseURL: env.AUTH_URL,
  secret: env.AUTH_SECRET,
  trustedOrigins: [env.AUTH_URL],
  database: prismaAdapter(prisma, { provider: "postgresql", transaction: true }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true
  },
  user: {
    additionalFields: {
      role: {
        type: ["USER", "ADMIN"],
        required: true,
        defaultValue: "USER",
        input: false
      }
    }
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, email: user.email.trim().toLowerCase(), role: "USER" }
        })
      }
    }
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 }
    }
  },
  advanced: {
    useSecureCookies: env.AUTH_URL.startsWith("https://"),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: env.AUTH_URL.startsWith("https://")
    },
    database: { generateId: "serial" },
    cookiePrefix: "foodrec"
  },
  plugins: [nextCookies()]
});
