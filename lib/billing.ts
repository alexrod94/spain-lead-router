import { db, type Firm } from "./db";
import { monthRange } from "./routing";

export type FirmMonth = {
  firm: Firm;
  billable: number;
  amount_cents: number;
  disputed: number;
  credited: number;
  statement: { emailed_at: Date | null; invoiced_at: Date | null; paid_at: Date | null } | null;
};

// Billable = delivered and not disputed. Open disputes and credited leads are not charged.
export async function monthSummary(month: string): Promise<FirmMonth[]> {
  const sql = await db();
  const { start, end } = monthRange(month);
  const rows = await sql<(Firm & {
    billable: number; amount_cents: number; disputed: number; credited: number;
    emailed_at: Date | null; invoiced_at: Date | null; paid_at: Date | null; has_statement: boolean;
  })[]>`
    select f.*,
      coalesce(sum(case when d.status = 'sent' then 1 else 0 end), 0)::int as billable,
      coalesce(sum(case when d.status = 'sent' then d.price_cents else 0 end), 0)::int as amount_cents,
      coalesce(sum(case when d.status = 'disputed' then 1 else 0 end), 0)::int as disputed,
      coalesce(sum(case when d.status = 'credited' then 1 else 0 end), 0)::int as credited,
      s.emailed_at, s.invoiced_at, s.paid_at, (s.id is not null) as has_statement
    from firms f
    left join deliveries d on d.firm_id = f.id and d.created_at >= ${start} and d.created_at < ${end}
    left join statements s on s.firm_id = f.id and s.month = ${month}
    group by f.id, s.id
    having count(d.id) > 0 or s.id is not null
    order by amount_cents desc, f.company`;
  return rows.map((r) => ({
    firm: r,
    billable: r.billable,
    amount_cents: r.amount_cents,
    disputed: r.disputed,
    credited: r.credited,
    statement: r.has_statement ? { emailed_at: r.emailed_at, invoiced_at: r.invoiced_at, paid_at: r.paid_at } : null,
  }));
}

export async function billableRows(firmId: string, month: string) {
  const sql = await db();
  const { start, end } = monthRange(month);
  return sql<{ date: Date; name: string; route: string; price: number; email: string; timeline: string }[]>`
    select d.created_at as date, l.name, l.email, l.route, l.timeline, d.price_cents as price
    from deliveries d join leads l on l.id = d.lead_id
    where d.firm_id = ${firmId} and d.status = 'sent' and d.created_at >= ${start} and d.created_at < ${end}
    order by d.created_at`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
}
