"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { login, logout, requireAdmin } from "@/lib/auth";
import { db, type Firm, type Lead } from "@/lib/db";
import { firmApprovedEmail, leadEmail, sendMail } from "@/lib/email";
import { routeLead, sendQueued } from "@/lib/leads";
import { sendMonthlyStatements } from "@/lib/statements";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function loginAction(formData: FormData) {
  if (!(await login(s(formData, "password")))) redirect("/admin/login?error=1");
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}

export async function setFirmStatus(formData: FormData) {
  await requireAdmin();
  const id = s(formData, "id");
  const status = s(formData, "status");
  if (!["active", "paused", "rejected", "pending"].includes(status)) return;
  const sql = await db();
  const [before] = await sql<Firm[]>`select * from firms where id = ${id}`;
  if (!before) return;
  const [firm] = await sql<Firm[]>`
    update firms set status = ${status},
      approved_at = case when ${status} = 'active' and approved_at is null then now() else approved_at end
    where id = ${id} returning *`;
  if (status === "active" && !before.approved_at) {
    try {
      await sendMail({ to: firm.email, ...firmApprovedEmail(firm) });
    } catch (e) {
      console.error("approval email failed", e);
    }
  }
  revalidatePath("/admin/firms");
  revalidatePath("/admin");
}

export async function updateFirm(formData: FormData) {
  await requireAdmin();
  const id = s(formData, "id");
  const priceEur = Number(s(formData, "price_eur").replace(",", "."));
  const capRaw = s(formData, "monthly_cap");
  const cap = capRaw === "" ? null : Math.max(0, Math.floor(Number(capRaw)));
  if (!Number.isFinite(priceEur) || priceEur < 0) return;
  const sql = await db();
  await sql`
    update firms set price_cents = ${Math.round(priceEur * 100)}, monthly_cap = ${cap},
      email = ${s(formData, "email").toLowerCase()}, contact_name = ${s(formData, "contact_name")},
      notes = ${s(formData, "notes")}
    where id = ${id}`;
  revalidatePath("/admin/firms");
}

export async function addFirmManually(formData: FormData) {
  await requireAdmin();
  const company = s(formData, "company");
  const email = s(formData, "email").toLowerCase();
  if (!company || !email.includes("@")) return;
  const sql = await db();
  await sql`
    insert into firms (company, contact_name, email, status, approved_at)
    values (${company}, ${s(formData, "contact_name")}, ${email}, 'active', now())
    on conflict (email) do nothing`;
  revalidatePath("/admin/firms");
}

export async function deliverLead(formData: FormData) {
  await requireAdmin();
  await routeLead(s(formData, "lead_id"));
  revalidatePath("/admin/leads");
  revalidatePath("/admin");
}

export async function resendDelivery(formData: FormData) {
  await requireAdmin();
  const id = s(formData, "delivery_id");
  const sql = await db();
  await sql`update deliveries set status = 'queued', error = '' where id = ${id} and status = 'failed'`;
  await sendQueued([id]);
  revalidatePath("/admin/leads");
}

export async function markSellable(formData: FormData) {
  await requireAdmin();
  const sql = await db();
  await sql`update leads set sellable = true, reason = 'manual' where id = ${s(formData, "lead_id")} and consent = true`;
  revalidatePath("/admin/leads");
}

export async function resolveDispute(formData: FormData) {
  await requireAdmin();
  const id = s(formData, "delivery_id");
  const decision = s(formData, "decision");
  const sql = await db();
  if (decision === "credit") {
    await sql`update deliveries set status = 'credited', resolved_at = now() where id = ${id} and status = 'disputed'`;
  } else if (decision === "reject") {
    await sql`update deliveries set status = 'sent', resolved_at = now() where id = ${id} and status = 'disputed'`;
  }
  revalidatePath("/admin/billing");
  revalidatePath("/admin");
}

export async function setStatementFlag(formData: FormData) {
  await requireAdmin();
  const firmId = s(formData, "firm_id");
  const month = s(formData, "month");
  const flag = s(formData, "flag");
  const sql = await db();
  if (flag === "invoiced") {
    await sql`insert into statements (firm_id, month, invoiced_at) values (${firmId}, ${month}, now())
              on conflict (firm_id, month) do update set invoiced_at = coalesce(statements.invoiced_at, now())`;
  } else if (flag === "paid") {
    await sql`insert into statements (firm_id, month, paid_at) values (${firmId}, ${month}, now())
              on conflict (firm_id, month) do update set paid_at = coalesce(statements.paid_at, now())`;
  }
  revalidatePath("/admin/billing");
}

export async function sendStatementNow(formData: FormData) {
  await requireAdmin();
  await sendMonthlyStatements(s(formData, "month"), { firmId: s(formData, "firm_id"), force: true });
  revalidatePath("/admin/billing");
}

// Sends you a sample lead email exactly as a firm would see it. Nothing is stored or billed.
export async function sendTestEmail() {
  await requireAdmin();
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  const firm = {
    id: "test", company: "Tu empresa de prueba", contact_name: "Alex", email: to, phone: "", website: "", notes: "",
    status: "active", price_cents: 3000, monthly_cap: null, last_assigned_at: null, approved_at: null, created_at: new Date(),
  } as Firm;
  const lead = {
    id: "test", name: "Jane Example", email: "jane@example.com", phone: "+44 7700 900123",
    citizenship: "United Kingdom", income_source: "A remote job for a company outside Spain",
    monthly_income: "€2,850 to €4,500", household: "Me and my partner", timeline: "In 3 to 6 months",
    route: "Digital Nomad Visa", consent: true, sellable: true, reason: "ok", source: "", created_at: new Date(),
  } as Lead;
  const { subject, html } = leadEmail(firm, lead, "ejemplo", 3000, true);
  await sendMail({ to, subject, html });
  redirect("/admin?test=sent");
}
