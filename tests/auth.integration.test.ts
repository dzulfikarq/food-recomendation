import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import "@/tests/helpers/test-database";

test("PostgreSQL registration, login, logout, role guards, and database constraints", async () => {
  Reflect.set(process.env, "NODE_ENV", "production");
  Reflect.set(process.env, "AUTH_URL", "http://127.0.0.1:3101");
  const [{ default: next }, { readApplicationEnvironment }, { prisma }] = await Promise.all([
    import("next"),
    import("@/lib/env"),
    import("@/lib/prisma")
  ]);
  const env = readApplicationEnvironment();
  const baseUrl = env.AUTH_URL;
  const password = "foodrec-integration-password";
  const email = `foodrec-${crypto.randomUUID()}@example.test`;
  let userId: number | undefined;
  let foodId: number | undefined;

  const app = next({ dev: false, hostname: "127.0.0.1", port: 3101 });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(3101, "127.0.0.1", resolve);
  });

  const page = (path: string, cookie?: string) => fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : undefined
  });
  const post = (path: string, body: FormData | Record<string, unknown>, cookie?: string) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      origin: baseUrl,
      ...(body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {})
    },
    body: body instanceof FormData ? body : JSON.stringify(body)
  });
  const sessionFor = (cookie: string) => fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie, origin: baseUrl } });
  const cookiesFrom = (response: Response) => response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");

  async function actionForm(path: string, cookie?: string) {
    const response = await page(path, cookie);
    assert.equal(response.status, 200);
    const html = await response.text();
    const start = html.indexOf("<form");
    const end = html.indexOf("</form>", start);
    assert.ok(start >= 0 && end > start, `No form found on ${path}`);
    const formHtml = html.slice(start, end + "</form>".length);
    const data = new FormData();
    for (const [tag] of formHtml.matchAll(/<input\b[^>]*>/g)) {
      if (!/\btype="hidden"/.test(tag)) continue;
      const name = tag.match(/\bname="([^"]+)"/)?.[1];
      if (!name?.startsWith("$ACTION_")) continue;
      const value = tag.match(/\bvalue="([^"]*)"/)?.[1] ?? "";
      data.set(name, value.replaceAll("&quot;", "\"").replaceAll("&amp;", "&"));
    }
    assert.ok([...data.keys()].some((name) => name.startsWith("$ACTION_")), `No server action metadata on ${path}`);
    return data;
  }

  try {
    assert.equal((await page("/")).status, 200);
    assert.equal((await page("/login")).status, 200);
    const registrationData = await actionForm("/register");
    registrationData.set("name", "Integration User");
    registrationData.set("email", email.toUpperCase());
    registrationData.set("password", password);
    registrationData.set("confirmPassword", "different-password");
    registrationData.set("role", "ADMIN");
    const invalidRegistration = await post("/register", registrationData);
    assert.equal(invalidRegistration.status, 200);
    assert.match(await invalidRegistration.text(), /Passwords do not match/);
    assert.equal(await prisma.user.findUnique({ where: { email } }), null);

    const validRegistration = await actionForm("/register");
    validRegistration.set("name", "Integration User");
    validRegistration.set("email", email.toUpperCase());
    validRegistration.set("password", password);
    validRegistration.set("confirmPassword", password);
    validRegistration.set("role", "ADMIN");
    const registration = await post("/register", validRegistration);
    assert.equal(registration.status, 303);
    const registrationCookie = cookiesFrom(registration);
    assert.match(registrationCookie, /session_token/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    userId = user.id;
    assert.equal(user.role, "USER");
    const credential = await prisma.account.findFirstOrThrow({ where: { userId: user.id, providerId: "credential" } });
    assert.ok(credential.password);
    assert.notEqual(credential.password, password);

    const registrationSession = await (await sessionFor(registrationCookie)).json();
    assert.equal(registrationSession.user.id, String(user.id));
    assert.equal(registrationSession.user.role, "USER");
    assert.equal("passwordHash" in registrationSession.user, false);
    assert.equal((await page("/admin")).status, 307);
    assert.equal((await page("/admin", registrationCookie)).status, 307);
    assert.equal((await page("/login", registrationCookie)).status, 307);
    assert.equal((await post("/api/auth/sign-up/email", { name: "Bypass", email: "bypass@example.test", password })).status, 404);

    const food = await prisma.food.create({
      data: { foodCode: `TEST-${crypto.randomUUID()}`, name: "Constraint test", category: "Test", taste: "Test", origin: "Test" }
    });
    foodId = food.id;
    await prisma.rating.create({ data: { userId: user.id, foodId: food.id, rating: 3 } });
    await assert.rejects(prisma.rating.create({ data: { userId: user.id, foodId: food.id, rating: 4 } }));
    await assert.rejects(prisma.rating.create({ data: { userId: user.id, foodId: food.id, rating: 6 } }));
    await assert.rejects(prisma.food.update({ where: { id: food.id }, data: { foodCode: `${food.foodCode}-changed` } }));
    await assert.rejects(prisma.food.delete({ where: { id: food.id } }));

    const logoutForm = await actionForm("/", registrationCookie);
    const userLogout = await post("/", logoutForm, registrationCookie);
    assert.equal(userLogout.status, 303);
    assert.equal(await (await sessionFor(registrationCookie)).json(), null);

    const invalidLoginForm = await actionForm("/login");
    invalidLoginForm.set("email", email);
    invalidLoginForm.set("password", "incorrect-password");
    const invalidLogin = await post("/login", invalidLoginForm);
    assert.equal(invalidLogin.status, 200);
    assert.match(await invalidLogin.text(), /Email or password is incorrect/);

    const adminLoginForm = await actionForm("/login");
    adminLoginForm.set("email", env.ADMIN_EMAIL ?? "");
    adminLoginForm.set("password", env.ADMIN_PASSWORD ?? "");
    const adminLogin = await post("/login", adminLoginForm);
    assert.equal(adminLogin.status, 303);
    const adminCookie = cookiesFrom(adminLogin);
    assert.match(adminCookie, /session_token/);
    const adminPage = await page("/admin", adminCookie);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /Administrator/);
    assert.equal((await page("/login", adminCookie)).status, 307);

    const adminLogoutForm = await actionForm("/", adminCookie);
    assert.equal((await post("/", adminLogoutForm, adminCookie)).status, 303);
    assert.equal(await (await sessionFor(adminCookie)).json(), null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await app.close();
    if (userId !== undefined) {
      await prisma.rating.deleteMany({ where: { userId } });
      if (foodId !== undefined) await prisma.food.delete({ where: { id: foodId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  }
});
