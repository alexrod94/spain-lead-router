import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./config";

const COOKIE = "lr_admin";

function token(): string {
  return createHash("sha256").update(`${env("ADMIN_PASSWORD")}::${env("AUTH_SECRET")}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function isAdmin(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value;
  return !!c && safeEqual(c, token());
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function login(password: string): Promise<boolean> {
  if (!safeEqual(password, env("ADMIN_PASSWORD"))) return false;
  (await cookies()).set(COOKIE, token(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

// For machine callers (Pinball, Vercel Cron): "Authorization: Bearer <secret>" or ?key=<secret>.
export function bearerOk(req: Request, secretName: string): boolean {
  const secret = process.env[secretName];
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const fromHeader = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const fromQuery = new URL(req.url).searchParams.get("key") ?? "";
  return (fromHeader !== "" && safeEqual(fromHeader, secret)) || (fromQuery !== "" && safeEqual(fromQuery, secret));
}
