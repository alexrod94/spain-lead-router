import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthKey, monthRange } from "@/lib/routing";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Every delivery in a month, one row each, for your accountant or invoicing tool.
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? monthKey();
  const { start, end } = monthRange(month);
  const sql = await db();
  const rows = await sql`
    select d.created_at, f.company, f.email as firm_email, l.name as lead_name, l.email as lead_email,
           l.route, l.timeline, d.status, d.price_cents
    from deliveries d join firms f on f.id = d.firm_id join leads l on l.id = d.lead_id
    where d.created_at >= ${start} and d.created_at < ${end}
    order by f.company, d.created_at`;
  const header = ["date", "firm", "firm_email", "lead_name", "lead_email", "route", "timeline", "status", "billable", "price_eur"];
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toISOString(),
      r.company,
      r.firm_email,
      r.lead_name,
      r.lead_email,
      r.route,
      r.timeline,
      r.status,
      r.status === "sent" ? "yes" : "no",
      (r.price_cents / 100).toFixed(2),
    ]
      .map(cell)
      .join(","),
  );
  return new NextResponse([header.join(","), ...lines].join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="spain-leads-${month}.csv"`,
    },
  });
}
