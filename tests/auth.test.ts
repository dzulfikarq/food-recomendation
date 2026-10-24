import assert from "node:assert/strict";
import test from "node:test";
import { loginSchema, registrationSchema } from "@/lib/validation/auth";

test("registration trims and normalizes user-provided identity", () => {
  const result = registrationSchema.safeParse({
    name: "  Riley Food  ",
    email: "  RILEY@example.com ",
    password: "long-safe-password",
    confirmPassword: "long-safe-password",
    role: "ADMIN"
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.name, "Riley Food");
    assert.equal(result.data.email, "riley@example.com");
    assert.equal("role" in result.data, false);
  }
});

test("registration rejects invalid identity, short password, and mismatched confirmation", () => {
  const valid = { name: "Riley Food", email: "riley@example.com", password: "long-safe-password", confirmPassword: "long-safe-password" };
  for (const input of [
    { ...valid, name: " " },
    { ...valid, email: "bad-email" },
    { ...valid, password: "short" },
    { ...valid, confirmPassword: "another-password" }
  ]) assert.equal(registrationSchema.safeParse(input).success, false);
});

test("login validation normalizes email and does not expose detailed credential errors", () => {
  const valid = loginSchema.safeParse({ email: " USER@example.com ", password: "a-password" });
  assert.equal(valid.success, true);
  if (valid.success) assert.equal(valid.data.email, "user@example.com");
  assert.equal(loginSchema.safeParse({ email: "user@example.com", password: "" }).success, false);
});
