import { money } from "@/lib/config";
import { db } from "@/lib/db";
import { monthLabel, monthSummary } from "@/lib/billing";
import { monthKey } from "@/lib/routing";
import { resolveDispute, sendStatementNow, setStatementFlag } from "../../actions";

export const dynamic = "force-dynamic";

function recentMonths(n = 12): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
}

export default async function BillingPage(props: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await props.searchParams;
  const month = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : monthKey();
  const summary = await monthSummary(month);
  const total = summary.reduce((n, s) => n + s.amount_cents, 0);
  const sql = await db();
  const disputes = await sql<{ id: string; created_at: Date; disputed_at: Date; dispute_reason: string; company: string; lead_name: string; lead_email: string; lead_phone: string }[]>`
    select d.id, d.created_at, d.disputed_at, d.dispute_reason, f.company, l.name as lead_name, l.email as lead_email, l.phone as lead_phone
    from deliveries d join firms f on f.id = d.firm_id join leads l on l.id = d.lead_id
    where d.status = 'disputed' order by d.disputed_at`;

  return (
    <>
      <h1>Billing</h1>
      <form className="row" style={{ marginBottom: 14 }}>
        <label style={{ flexDirection: "row", alignItems: "center" }}>
          Month
          <select id="month" name="month" defaultValue={month}>
            {recentMonths().map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </label>
        <button className="ghost" type="submit">Show</button>
        <a className="btn ghost" href={`/api/billing/export?month=${month}`}>Download CSV</a>
      </form>

      <p>
        <b>{money(total)}</b> billable in {monthLabel(month)}. Statements go out automatically on the 1st of the following month at 09:00 UTC.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Firm</th>
              <th className="num">Billable leads</th>
              <th className="num">Amount</th>
              <th className="num">Open disputes</th>
              <th className="num">Credited</th>
              <th>Statement</th>
              <th>Invoice</th>
            </tr>
          </thead>
          <tbody>
            {summary.length === 0 ? (
              <tr><td colSpan={7} className="muted">No deliveries in this month.</td></tr>
            ) : null}
            {summary.map((s) => (
              <tr key={s.firm.id}>
                <td><b>{s.firm.company}</b><div className="small muted">{s.firm.email}</div></td>
                <td className="num">{s.billable}</td>
                <td className="num">{money(s.amount_cents)}</td>
                <td className="num">{s.disputed}</td>
                <td className="num">{s.credited}</td>
                <td>
                  {s.statement?.emailed_at ? (
                    <span className="pill ok">Sent {new Date(s.statement.emailed_at).toISOString().slice(0, 10)}</span>
                  ) : (
                    <span className="pill muted">Not sent</span>
                  )}
                  <form action={sendStatementNow} style={{ marginTop: 6 }}>
                    <input type="hidden" name="firm_id" value={s.firm.id} />
                    <input type="hidden" name="month" value={month} />
                    <button className="ghost small" type="submit" disabled={s.billable === 0}>
                      {s.statement?.emailed_at ? "Send again" : "Send now"}
                    </button>
                  </form>
                </td>
                <td>
                  <div className="row">
                    {s.statement?.invoiced_at ? (
                      <span className="pill ok">Invoiced</span>
                    ) : (
                      <form action={setStatementFlag}>
                        <input type="hidden" name="firm_id" value={s.firm.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="flag" value="invoiced" />
                        <button className="ghost small" type="submit">Mark invoiced</button>
                      </form>
                    )}
                    {s.statement?.paid_at ? (
                      <span className="pill ok">Paid</span>
                    ) : (
                      <form action={setStatementFlag}>
                        <input type="hidden" name="firm_id" value={s.firm.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="flag" value="paid" />
                        <button className="ghost small" type="submit">Mark paid</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Open disputes</h2>
      <p className="muted small">Credit a lead only when the contact details are fake. A lead that doesn't answer is still billable.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Reported</th><th>Firm</th><th>Lead</th><th>Reason</th><th>Decision</th></tr>
          </thead>
          <tbody>
            {disputes.length === 0 ? <tr><td colSpan={5} className="muted">No open disputes.</td></tr> : null}
            {disputes.map((d) => (
              <tr key={d.id}>
                <td className="small">{new Date(d.disputed_at).toISOString().slice(0, 10)}</td>
                <td>{d.company}</td>
                <td><b>{d.lead_name}</b><div className="small muted">{d.lead_email} · {d.lead_phone}</div></td>
                <td className="small">{d.dispute_reason}</td>
                <td>
                  <div className="row">
                    <form action={resolveDispute}>
                      <input type="hidden" name="delivery_id" value={d.id} />
                      <input type="hidden" name="decision" value="credit" />
                      <button className="small" type="submit">Credit (don't bill)</button>
                    </form>
                    <form action={resolveDispute}>
                      <input type="hidden" name="delivery_id" value={d.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <button className="ghost small" type="submit">Reject (bill)</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
