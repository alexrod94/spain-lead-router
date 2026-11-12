import { appUrl, DISPUTE_DAYS, env, es, money } from "./config";
import type { Firm, Lead } from "./db";

type Mail = { to: string; subject: string; html: string; replyTo?: string };

export async function sendMail({ to, subject, html, replyTo }: Mail): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("EMAIL_FROM"),
      to: [to],
      subject,
      html,
      reply_to: replyTo ?? process.env.ADMIN_EMAIL,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id) throw new Error(`Resend ${res.status}: ${data.message ?? "unknown error"}`);
  return { id: data.id };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f1ec;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:10px;padding:28px 24px;border:1px solid #e6e0d6">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#b0121b;font-weight:bold">Hispanic Nomad · Leads España</p>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.25">${esc(title)}</h1>
${body}
</div>
<p style="font-size:12px;color:#6b665e;margin:16px 4px">Hispanic Nomad · ${esc(process.env.ADMIN_EMAIL ?? "")}</p>
</div></body></html>`;
}

function row(label: string, value: string, link?: string): string {
  const v = link ? `<a href="${esc(link)}" style="color:#b0121b">${esc(value)}</a>` : esc(value || "—");
  return `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;color:#6b665e;font-size:14px;width:42%">${esc(label)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;font-size:15px;font-weight:bold">${v}</td></tr>`;
}

export function leadEmail(firm: Firm, lead: Lead, disputeToken: string, priceCents: number, test = false) {
  const subject = `${test ? "[PRUEBA] " : ""}Nuevo lead: ${es(lead.route)}, mudanza ${es(lead.timeline)}`;
  const phoneLink = lead.phone ? `tel:${lead.phone.replace(/[^+\d]/g, "")}` : undefined;
  const html = shell(
    `Nuevo lead para ${firm.company}`,
    `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">Hola ${esc(firm.contact_name || firm.company)}, tienes un nuevo lead de alguien que quiere mudarse a España. Ha marcado expresamente que quiere que le contacten hasta tres empresas de reubicación para una valoración gratuita de su caso.</p>
<table style="width:100%;border-collapse:collapse;margin:0 0 18px">
${row("Nombre", lead.name)}
${row("Email", lead.email, `mailto:${lead.email}`)}
${row("Teléfono", lead.phone, phoneLink)}
${row("Ruta probable", es(lead.route))}
${row("Pasaporte", es(lead.citizenship))}
${row("Fuente de ingresos", es(lead.income_source))}
${row("Ingresos mensuales (bruto)", es(lead.monthly_income))}
${row("Quién se muda", es(lead.household))}
${row("Cuándo quiere mudarse", es(lead.timeline))}
</table>
<p style="font-size:14px;line-height:1.5;margin:0 0 10px"><b>Consejo:</b> los leads que reciben respuesta en las primeras horas convierten mucho mejor. Este lead se ha enviado como máximo a 3 empresas.</p>
<p style="font-size:14px;line-height:1.5;margin:0 0 10px">Precio: ${money(priceCents)}, que se incluirá en tu resumen mensual.</p>
<p style="font-size:14px;line-height:1.5;margin:0">¿Los datos de contacto son falsos? Avísanos en los próximos ${DISPUTE_DAYS} días y no se te cobrará: <a href="${appUrl()}/disputa/${disputeToken}" style="color:#b0121b">reportar datos falsos</a>.</p>`,
  );
  return { subject, html };
}

export function firmReceivedEmail(firm: Pick<Firm, "company" | "contact_name">) {
  return {
    subject: "Hemos recibido tu solicitud · Leads España",
    html: shell(
      "Solicitud recibida",
      `<p style="font-size:15px;line-height:1.5">Hola ${esc(firm.contact_name || firm.company)}, gracias por apuntarte. Revisamos cada empresa a mano y te escribiremos en cuanto tu cuenta esté activa. Desde ese momento recibirás los leads por email en cuanto lleguen.</p>`,
    ),
  };
}

export function firmApprovedEmail(firm: Firm) {
  return {
    subject: "Tu cuenta está activa · Leads España",
    html: shell(
      "Ya estás dentro",
      `<p style="font-size:15px;line-height:1.5">Hola ${esc(firm.contact_name || firm.company)}, tu cuenta está activa. A partir de ahora recibirás en <b>${esc(firm.email)}</b> cada lead que te toque, con su nombre, email, teléfono y situación.</p>
<ul style="font-size:15px;line-height:1.6;padding-left:18px">
<li>Precio por lead: <b>${money(firm.price_cents)}</b>.</li>
<li>Cada lead se comparte con un máximo de 3 empresas, por turnos.</li>
<li>Si los datos de contacto de un lead son falsos, puedes reportarlo en ${DISPUTE_DAYS} días desde el propio email y no se cobra.</li>
<li>El día 1 de cada mes recibirás un resumen con los leads del mes anterior, y después la factura.</li>
</ul>`,
    ),
  };
}

export function statementEmail(firm: Firm, monthLabel: string, rows: { date: Date; name: string; route: string; price: number }[], total: number) {
  const lines = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px">${r.date.toISOString().slice(0, 10)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px">${esc(r.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px">${esc(es(r.route))}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:right">${money(r.price)}</td></tr>`,
    )
    .join("");
  return {
    subject: `Resumen de leads · ${monthLabel}`,
    html: shell(
      `Tu resumen de ${monthLabel}`,
      `<p style="font-size:15px;line-height:1.5">Hola ${esc(firm.contact_name || firm.company)}, estos son los leads que recibiste en ${monthLabel}. Los leads reportados como falsos y aceptados no aparecen.</p>
<table style="width:100%;border-collapse:collapse;margin:8px 0 14px">
<tr><th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b665e">Fecha</th><th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b665e">Lead</th><th style="text-align:left;padding:6px 8px;font-size:12px;color:#6b665e">Ruta</th><th style="text-align:right;padding:6px 8px;font-size:12px;color:#6b665e">Precio</th></tr>
${lines}
<tr><td colspan="3" style="padding:10px 8px;font-weight:bold">Total (${rows.length} leads)</td><td style="padding:10px 8px;font-weight:bold;text-align:right">${money(total)}</td></tr>
</table>
<p style="font-size:14px;line-height:1.5">Recibirás la factura en los próximos días. Si ves algún error, responde a este email.</p>`,
    ),
  };
}

export function adminEmail(subject: string, lines: string[], link?: { label: string; href: string }) {
  return {
    subject: `[Lead Router] ${subject}`,
    html: shell(
      subject,
      lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:0 0 10px">${l}</p>`).join("") +
        (link ? `<p><a href="${esc(link.href)}" style="color:#b0121b;font-weight:bold">${esc(link.label)}</a></p>` : ""),
    ),
  };
}

export async function notifyAdmin(subject: string, lines: string[], link?: { label: string; href: string }) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  try {
    await sendMail({ to, ...adminEmail(subject, lines, link) });
  } catch (e) {
    console.error("admin notify failed", e);
  }
}

export { esc };
