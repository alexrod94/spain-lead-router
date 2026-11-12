import { appUrl, money } from "./config";
import { db } from "./db";
import { notifyAdmin, sendMail, statementEmail } from "./email";
import { billableRows, monthLabel, monthSummary } from "./billing";

// Emails each firm its statement for the month and records it. Safe to run twice:
// firms already emailed for that month are skipped.
export async function sendMonthlyStatements(month: string, opts: { firmId?: string; force?: boolean } = {}) {
  const sql = await db();
  const summary = await monthSummary(month);
  const label = monthLabel(month);
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const s of summary) {
    if (opts.firmId && s.firm.id !== opts.firmId) continue;
    if (s.billable === 0) continue;
    if (s.statement?.emailed_at && !opts.force) {
      skipped.push(s.firm.company);
      continue;
    }
    const rows = await billableRows(s.firm.id, month);
    try {
      const { subject, html } = statementEmail(s.firm, label, rows.map((r) => ({ ...r, date: new Date(r.date) })), s.amount_cents);
      await sendMail({ to: s.firm.email, subject, html });
      await sql`
        insert into statements (firm_id, month, lead_count, amount_cents, emailed_at)
        values (${s.firm.id}, ${month}, ${s.billable}, ${s.amount_cents}, now())
        on conflict (firm_id, month) do update
          set lead_count = excluded.lead_count, amount_cents = excluded.amount_cents, emailed_at = now()`;
      sent.push(s.firm.company);
    } catch (e) {
      failed.push(`${s.firm.company}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!opts.firmId) {
    const total = summary.reduce((n, s) => n + s.amount_cents, 0);
    await notifyAdmin(
      `Statements for ${label}`,
      [
        `Sent: ${sent.length}. Already sent before: ${skipped.length}. Failed: ${failed.length}.`,
        `Total to invoice: <b>${money(total)}</b>.`,
        ...failed.map((f) => `Failed: ${f}`),
      ],
      { label: "Open billing", href: `${appUrl()}/admin/billing?month=${month}` },
    );
  }
  return { sent, skipped, failed };
}
