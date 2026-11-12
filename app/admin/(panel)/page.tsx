import Link from "next/link";
import { appUrl, money } from "@/lib/config";
import { db } from "@/lib/db";
import { monthKey, monthRange } from "@/lib/routing";
import { sendTestEmail } from "../actions";

export const dynamic = "force-dynamic";

export default async function Overview(props: { searchParams: Promise<{ test?: string }> }) {
  const searchParams = await props.searchParams;
  const sql = await db();
  const month = monthKey();
  const { start, end } = monthRange(month);
  const [l] = await sql<{ total: number; consented: number; sellable: number; undelivered: number }[]>`
    select count(*)::int as total,
      count(*) filter (where consent)::int as consented,
      count(*) filter (where sellable)::int as sellable,
      count(*) filter (where sellable and not exists (select 1 from deliveries d where d.lead_id = leads.id))::int as undelivered
    from leads where created_at >= ${start} and created_at < ${end}`;
  const [d] = await sql<{ sent: number; revenue: number; disputed: number; failed: number }[]>`
    select count(*) filter (where status = 'sent')::int as sent,
      coalesce(sum(price_cents) filter (where status = 'sent'), 0)::int as revenue,
      count(*) filter (where status = 'disputed')::int as disputed,
      count(*) filter (where status = 'failed')::int as failed
    from deliveries where created_at >= ${start} and created_at < ${end}`;
  const [f] = await sql<{ active: number; pending: number }[]>`
    select count(*) filter (where status = 'active')::int as active, count(*) filter (where status = 'pending')::int as pending from firms`;
  const sellRate = l.total ? Math.round((l.sellable / l.total) * 100) : 0;
  const perLead = l.total ? Math.round(d.revenue / l.total) : 0;

  return (
    <>
      <h1>This month</h1>
      {searchParams.test ? <p className="notice">Sample lead email sent to {process.env.ADMIN_EMAIL}.</p> : null}
      {f.pending > 0 ? (
        <p className="notice">
          {f.pending} firm{f.pending > 1 ? "s are" : " is"} waiting for approval. <Link href="/admin/firms">Review firms</Link>
        </p>
      ) : null}
      {l.undelivered > 0 ? (
        <p className="notice">
          {l.undelivered} sellable lead{l.undelivered > 1 ? "s have" : " has"} not been sent to any firm. <Link href="/admin/leads">Open leads</Link>
        </p>
      ) : null}
      {d.disputed > 0 ? (
        <p className="notice">
          {d.disputed} open dispute{d.disputed > 1 ? "s" : ""}. <Link href="/admin/billing">Resolve</Link>
        </p>
      ) : null}

      <div className="grid">
        <div className="stat"><b>{l.total}</b><span>Quiz leads</span></div>
        <div className="stat"><b>{l.consented}</b><span>Ticked consent</span></div>
        <div className="stat"><b>{l.sellable}</b><span>Sellable ({sellRate}%)</span></div>
        <div className="stat"><b>{d.sent}</b><span>Deliveries billed</span></div>
        <div className="stat"><b>{money(d.revenue)}</b><span>Earned this month</span></div>
        <div className="stat"><b>{money(perLead)}</b><span>Revenue per raw lead</span></div>
        <div className="stat"><b>{f.active}</b><span>Active firms</span></div>
        <div className="stat"><b>{d.failed}</b><span>Failed emails</span></div>
      </div>

      <h2>Your links</h2>
      <div className="card">
        <p>
          Firm sign-up page (send this in your cold emails): <a href={`${appUrl()}/unete`}>{appUrl()}/unete</a>
        </p>
        <p className="small muted">
          Revenue per raw lead is your break-even cost per lead on Meta. Compare it with the cost per lead in Ads Manager.
        </p>
        <form action={sendTestEmail}>
          <button className="ghost" type="submit">Send me a sample lead email</button>
        </form>
      </div>
    </>
  );
}
