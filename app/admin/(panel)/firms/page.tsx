import { money } from "@/lib/config";
import { db, type Firm } from "@/lib/db";
import { monthKey, monthRange } from "@/lib/routing";
import { addFirmManually, setFirmStatus, updateFirm } from "../../actions";

export const dynamic = "force-dynamic";

const statusClass: Record<string, string> = { active: "ok", pending: "warn", paused: "muted", rejected: "bad" };

function StatusButton({ id, status, label, ghost = true }: { id: string; status: string; label: string; ghost?: boolean }) {
  return (
    <form action={setFirmStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`${ghost ? "ghost " : ""}small`} type="submit">{label}</button>
    </form>
  );
}

export default async function FirmsPage() {
  const sql = await db();
  const { start, end } = monthRange(monthKey());
  const firms = await sql<(Firm & { month_count: number; total_count: number })[]>`
    select f.*,
      (select count(*)::int from deliveries d where d.firm_id = f.id and d.status in ('sent','disputed')
         and d.created_at >= ${start} and d.created_at < ${end}) as month_count,
      (select count(*)::int from deliveries d where d.firm_id = f.id and d.status = 'sent') as total_count
    from firms f
    order by case f.status when 'pending' then 0 when 'active' then 1 when 'paused' then 2 else 3 end, f.created_at`;

  return (
    <>
      <h1>Firms</h1>
      <p className="muted">
        Each sellable lead goes to up to 3 active firms. The firm that has waited longest goes first; a firm at its monthly cap is skipped.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Firm</th>
              <th>Status</th>
              <th className="num">Leads this month</th>
              <th className="num">All time</th>
              <th>Price, cap and details</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {firms.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">No firms yet. Share your /unete link in your outreach, or add one below.</td>
              </tr>
            ) : null}
            {firms.map((f) => (
              <tr key={f.id}>
                <td>
                  <b>{f.company}</b>
                  <div className="small muted">{f.phone}</div>
                  {f.website ? (
                    <div className="small">
                      <a href={f.website} target="_blank" rel="noreferrer">{f.website}</a>
                    </div>
                  ) : null}
                  <div className="small muted">Joined {new Date(f.created_at).toISOString().slice(0, 10)}</div>
                </td>
                <td><span className={`pill ${statusClass[f.status]}`}>{f.status}</span></td>
                <td className="num">
                  {f.month_count}
                  {f.monthly_cap !== null ? <span className="muted"> / {f.monthly_cap}</span> : null}
                </td>
                <td className="num">{f.total_count}</td>
                <td style={{ minWidth: 260 }}>
                  <form action={updateFirm} className="stack">
                    <input type="hidden" name="id" value={f.id} />
                    <div className="row">
                      <label style={{ flex: "1 1 90px" }}>
                        <span className="small">Price €</span>
                        <input id={`price-${f.id}`} name="price_eur" type="number" step="0.01" min="0" defaultValue={(f.price_cents / 100).toFixed(2)} />
                      </label>
                      <label style={{ flex: "1 1 90px" }}>
                        <span className="small">Cap / month</span>
                        <input id={`cap-${f.id}`} name="monthly_cap" type="number" min="0" placeholder="none" defaultValue={f.monthly_cap ?? ""} />
                      </label>
                    </div>
                    <label>
                      <span className="small">Contact</span>
                      <input id={`contact-${f.id}`} name="contact_name" type="text" defaultValue={f.contact_name} />
                    </label>
                    <label>
                      <span className="small">Lead email</span>
                      <input id={`email-${f.id}`} name="email" type="email" defaultValue={f.email} />
                    </label>
                    <label>
                      <span className="small">Notes</span>
                      <textarea id={`notes-${f.id}`} name="notes" rows={2} defaultValue={f.notes} />
                    </label>
                    <div>
                      <button className="ghost small" type="submit">Save</button>
                      <span className="small muted"> {money(f.price_cents)} per lead</span>
                    </div>
                  </form>
                </td>
                <td>
                  <div className="row">
                    {f.status === "pending" ? (
                      <>
                        <StatusButton id={f.id} status="active" label="Approve" ghost={false} />
                        <StatusButton id={f.id} status="rejected" label="Reject" />
                      </>
                    ) : null}
                    {f.status === "active" ? <StatusButton id={f.id} status="paused" label="Pause" /> : null}
                    {f.status === "paused" || f.status === "rejected" ? <StatusButton id={f.id} status="active" label="Activate" /> : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Add a firm yourself</h2>
      <form action={addFirmManually} className="card row">
        <label style={{ flex: "1 1 200px" }}>
          Company
          <input id="new-company" name="company" type="text" required />
        </label>
        <label style={{ flex: "1 1 160px" }}>
          Contact name
          <input id="new-contact" name="contact_name" type="text" />
        </label>
        <label style={{ flex: "1 1 220px" }}>
          Lead email
          <input id="new-email" name="email" type="email" required />
        </label>
        <div style={{ alignSelf: "flex-end" }}>
          <button type="submit">Add as active</button>
        </div>
      </form>
      <p className="small muted">Firms you add here start active straight away and get no welcome email.</p>
    </>
  );
}
