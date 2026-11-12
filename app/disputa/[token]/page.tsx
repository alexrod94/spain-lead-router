import { redirect } from "next/navigation";
import { appUrl, DISPUTE_DAYS, es } from "@/lib/config";
import { db } from "@/lib/db";
import { notifyAdmin } from "@/lib/email";

export const dynamic = "force-dynamic";

type Row = {
  delivery_id: string;
  status: string;
  created_at: Date;
  dispute_reason: string;
  company: string;
  lead_name: string;
  route: string;
};

async function load(token: string): Promise<Row | null> {
  const sql = await db();
  const rows = await sql<Row[]>`
    select d.id as delivery_id, d.status, d.created_at, d.dispute_reason, f.company, l.name as lead_name, l.route
    from deliveries d join firms f on f.id = d.firm_id join leads l on l.id = d.lead_id
    where d.dispute_token = ${token}`;
  return rows[0] ?? null;
}

function withinWindow(created: Date): boolean {
  return Date.now() - new Date(created).getTime() <= DISPUTE_DAYS * 24 * 60 * 60 * 1000;
}

async function report(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim().slice(0, 1000);
  const row = await load(token);
  if (!row) redirect("/unete");
  if (row.status !== "sent" || !withinWindow(row.created_at)) redirect(`/disputa/${token}`);
  const sql = await db();
  await sql`
    update deliveries set status = 'disputed', disputed_at = now(),
      dispute_reason = ${[reason, details].filter(Boolean).join(" — ")}
    where dispute_token = ${token} and status = 'sent'`;
  await notifyAdmin(
    `Dispute from ${row.company}`,
    [`Lead: ${row.lead_name} (${row.route})`, `Reason: ${reason}${details ? ` — ${details}` : ""}`],
    { label: "Review dispute", href: `${appUrl()}/admin/billing` },
  );
  redirect(`/disputa/${token}?ok=1`);
}

export default async function DisputePage(props: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const row = await load(params.token);
  if (!row) {
    return (
      <main className="wrap narrow">
        <h1>Enlace no válido</h1>
        <p>Este enlace no existe. Si crees que es un error, responde al email del lead.</p>
      </main>
    );
  }

  const open = row.status === "sent" && withinWindow(row.created_at);
  return (
    <main className="wrap narrow">
      <p className="kicker">Hispanic Nomad · Leads España</p>
      <h1>Reportar datos falsos</h1>
      <p>
        Lead: <b>{row.lead_name || "sin nombre"}</b> · {es(row.route)} · recibido el {new Date(row.created_at).toLocaleDateString("es-ES")} por{" "}
        {row.company}.
      </p>

      {searchParams.ok || row.status === "disputed" ? (
        <p className="notice">Recibido. Lo revisamos en un máximo de 48 horas; mientras tanto este lead no se cobra.</p>
      ) : row.status === "credited" ? (
        <p className="notice">Este lead ya está anulado y no se cobrará.</p>
      ) : !open ? (
        <p className="notice">El plazo de {DISPUTE_DAYS} días para reportar este lead ha terminado. Si hay un problema, responde al email del lead.</p>
      ) : (
        <form action={report} className="stack card">
          <input type="hidden" name="token" value={params.token} />
          <p className="small muted">
            Solo se anulan leads con datos de contacto falsos. Un lead que no responde o no contrata se cobra igualmente, tal como recoge el acuerdo.
          </p>
          <label>
            Motivo
            <select id="reason" name="reason" required defaultValue="">
              <option value="" disabled>
                Elige uno
              </option>
              <option>El email rebota o no existe</option>
              <option>El teléfono no existe o es de otra persona</option>
              <option>Los datos son claramente inventados</option>
              <option>Otro</option>
            </select>
          </label>
          <label>
            Detalles (opcional)
            <textarea id="details" name="details" rows={3} />
          </label>
          <div>
            <button type="submit">Enviar reporte</button>
          </div>
        </form>
      )}
    </main>
  );
}
