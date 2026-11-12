import { db, type Lead } from "@/lib/db";
import { deliverLead, markSellable, resendDelivery } from "../../actions";

export const dynamic = "force-dynamic";

type Row = Lead & {
  deliveries: { id: string; company: string; status: string; error: string }[] | null;
};

const reasonLabel: Record<string, string> = {
  ok: "Sellable",
  manual: "Sellable (manual)",
  no_consent: "No consent",
  route_not_sold: "Route not sold",
  timeline_too_far: "Moving later",
  no_email: "No email",
};

function statusPill(status: string) {
  const cls = status === "sent" ? "ok" : status === "failed" || status === "disputed" ? "bad" : status === "credited" ? "muted" : "warn";
  return <span className={`pill ${cls}`}>{status}</span>;
}

export default async function LeadsPage(props: { searchParams: Promise<{ filter?: string }> }) {
  const searchParams = await props.searchParams;
  const sql = await db();
  const filter = searchParams.filter ?? "all";
  const rows = await sql<Row[]>`
    select l.*, (
      select json_agg(json_build_object('id', d.id, 'company', f.company, 'status', d.status, 'error', d.error) order by d.created_at)
      from deliveries d join firms f on f.id = d.firm_id where d.lead_id = l.id
    ) as deliveries
    from leads l
    where ${filter === "sellable" ? sql`l.sellable` : filter === "consent" ? sql`l.consent` : sql`true`}
    order by l.created_at desc
    limit 300`;

  return (
    <>
      <h1>Leads</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <a className={`btn ${filter === "all" ? "" : "ghost"}`} href="/admin/leads">All</a>
        <a className={`btn ${filter === "consent" ? "" : "ghost"}`} href="/admin/leads?filter=consent">Ticked consent</a>
        <a className={`btn ${filter === "sellable" ? "" : "ghost"}`} href="/admin/leads?filter=sellable">Sellable</a>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Lead</th>
              <th>Route</th>
              <th>Moving</th>
              <th>Status</th>
              <th>Sent to</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No leads yet. They appear here the moment someone finishes the Spain visa check.
                </td>
              </tr>
            ) : null}
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="small">{new Date(l.created_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>
                  <b>{l.name || "—"}</b>
                  <div className="small muted">{l.email}</div>
                  <div className="small muted">{l.phone}</div>
                </td>
                <td className="small">{l.route}</td>
                <td className="small">{l.timeline}</td>
                <td>
                  <span className={`pill ${l.sellable ? "ok" : "muted"}`}>{reasonLabel[l.reason] ?? l.reason}</span>
                  {!l.sellable && l.consent ? (
                    <form action={markSellable} style={{ marginTop: 6 }}>
                      <input type="hidden" name="lead_id" value={l.id} />
                      <button className="ghost small" type="submit">Mark sellable</button>
                    </form>
                  ) : null}
                </td>
                <td>
                  {(l.deliveries ?? []).map((d) => (
                    <div key={d.id} className="row small" style={{ marginBottom: 4 }}>
                      {d.company} {statusPill(d.status)}
                      {d.status === "failed" ? (
                        <form action={resendDelivery}>
                          <input type="hidden" name="delivery_id" value={d.id} />
                          <button className="ghost small" type="submit" title={d.error}>Resend</button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                  {l.sellable && (l.deliveries ?? []).length < 3 ? (
                    <form action={deliverLead}>
                      <input type="hidden" name="lead_id" value={l.id} />
                      <button className="small" type="submit">
                        {(l.deliveries ?? []).length === 0 ? "Deliver" : "Fill remaining slots"}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
