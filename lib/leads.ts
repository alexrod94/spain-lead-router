import { randomBytes } from "crypto";
import { appUrl, es, MAX_FIRMS_PER_LEAD } from "./config";
import { db, type Firm, type Lead } from "./db";
import { leadEmail, notifyAdmin, sendMail } from "./email";
import { dedupeKey, monthRange, monthKey, normalizeLead, pickFirms, sellableCheck } from "./routing";

export type IntakeResult =
  | { status: "duplicate" }
  | { status: "stored"; leadId: string; sellable: boolean; reason: string; deliveredTo: string[] };

export async function intakeLead(body: Record<string, unknown>): Promise<IntakeResult> {
  const sql = await db();
  const lead = normalizeLead(body);
  const { sellable, reason } = sellableCheck(lead);
  const key = dedupeKey(lead);

  const inserted = await sql<{ id: string }[]>`
    insert into leads (dedupe_key, name, email, phone, citizenship, income_source, monthly_income,
                       household, timeline, route, consent, sellable, reason, source, raw)
    values (${key}, ${lead.name}, ${lead.email}, ${lead.phone}, ${lead.citizenship}, ${lead.income_source},
            ${lead.monthly_income}, ${lead.household}, ${lead.timeline}, ${lead.route}, ${lead.consent},
            ${sellable}, ${reason}, ${lead.source}, ${sql.json(body as never)})
    on conflict (dedupe_key) do nothing
    returning id`;
  if (inserted.length === 0) return { status: "duplicate" };
  const leadId = inserted[0].id;

  if (!sellable) return { status: "stored", leadId, sellable, reason, deliveredTo: [] };
  const deliveredTo = await routeLead(leadId);
  return { status: "stored", leadId, sellable, reason, deliveredTo };
}

// Picks up to 3 firms in rotation, records the deliveries, then emails each firm.
export async function routeLead(leadId: string): Promise<string[]> {
  const sql = await db();
  const { start, end } = monthRange(monthKey());

  const assigned = await sql.begin(async (tx) => {
    const already = await tx<{ firm_id: string }[]>`select firm_id from deliveries where lead_id = ${leadId}`;
    const exclude = new Set(already.map((r) => r.firm_id));
    const slots = MAX_FIRMS_PER_LEAD - already.length;
    if (slots <= 0) return [] as { firm_id: string; delivery_id: string; token: string; price: number }[];

    // Lock active firms so two leads arriving together don't both pick the same "next" firm.
    const firms = await tx<(Firm & { month_count: number })[]>`
      select f.*, (
        select count(*)::int from deliveries d
        where d.firm_id = f.id and d.status in ('queued','sent','disputed')
          and d.created_at >= ${start} and d.created_at < ${end}
      ) as month_count
      from firms f where f.status = 'active'
      order by f.id
      for update`;

    const chosen = pickFirms(
      firms
        .filter((f) => !exclude.has(f.id))
        .map((f) => ({
          id: f.id,
          createdAt: new Date(f.created_at),
          lastAssignedAt: f.last_assigned_at ? new Date(f.last_assigned_at) : null,
          monthCount: f.month_count,
          monthlyCap: f.monthly_cap,
        })),
      slots,
    );

    // Stamp the chosen firms one millisecond apart, in pick order and always later than any
    // earlier stamp, so the next lead continues the rotation instead of tying.
    const latest = firms.reduce((m, f) => Math.max(m, f.last_assigned_at ? new Date(f.last_assigned_at).getTime() : 0), 0);
    let stamp = Math.max(Date.now(), latest + 1);

    const out: { firm_id: string; delivery_id: string; token: string; price: number }[] = [];
    for (const firmId of chosen) {
      const firm = firms.find((f) => f.id === firmId)!;
      const token = randomBytes(18).toString("base64url");
      const [d] = await tx<{ id: string }[]>`
        insert into deliveries (lead_id, firm_id, price_cents, status, dispute_token)
        values (${leadId}, ${firmId}, ${firm.price_cents}, 'queued', ${token})
        returning id`;
      await tx`update firms set last_assigned_at = ${new Date(stamp++)} where id = ${firmId}`;
      out.push({ firm_id: firmId, delivery_id: d.id, token, price: firm.price_cents });
    }
    return out;
  });

  if (assigned.length === 0) {
    const [lead] = await sql<Lead[]>`select * from leads where id = ${leadId}`;
    if (lead) {
      await notifyAdmin(
        "Sellable lead with no firm to send it to",
        [
          `${lead.name || lead.email} (${es(lead.route)}, ${es(lead.timeline)}) consented and qualifies, but no active firm had room.`,
          "Approve a firm or raise a cap, then press Deliver on the lead.",
        ],
        { label: "Open leads", href: `${appUrl()}/admin/leads` },
      );
    }
    return [];
  }

  await sendQueued(assigned.map((a) => a.delivery_id));
  return assigned.map((a) => a.firm_id);
}

export async function sendQueued(deliveryIds: string[]): Promise<void> {
  if (deliveryIds.length === 0) return;
  const sql = await db();
  const rows = await sql<{ delivery_id: string; token: string; price_cents: number; firm: Firm; lead: Lead }[]>`
    select d.id as delivery_id, d.dispute_token as token, d.price_cents,
           to_jsonb(f.*) as firm, to_jsonb(l.*) as lead
    from deliveries d join firms f on f.id = d.firm_id join leads l on l.id = d.lead_id
    where d.id in ${sql(deliveryIds)}`;

  await Promise.all(
    rows.map(async (r) => {
      try {
        const { subject, html } = leadEmail(r.firm, r.lead, r.token, r.price_cents);
        const { id } = await sendMail({ to: r.firm.email, subject, html, replyTo: process.env.ADMIN_EMAIL });
        await sql`update deliveries set status = 'sent', email_id = ${id}, error = '' where id = ${r.delivery_id}`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await sql`update deliveries set status = 'failed', error = ${msg} where id = ${r.delivery_id}`;
        await notifyAdmin("A lead email failed to send", [
          `Lead ${r.lead.name || r.lead.email} → ${r.firm.company}: ${msg}`,
          "It is marked failed and is not billed. Use Resend on the lead to try again.",
        ]);
      }
    }),
  );
}
