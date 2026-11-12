import { redirect } from "next/navigation";
import { appUrl, DISPUTE_DAYS, LEAD_PRICE_CENTS, MAX_FIRMS_PER_LEAD, money } from "@/lib/config";
import { db } from "@/lib/db";
import { firmReceivedEmail, notifyAdmin, sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";

async function signUp(formData: FormData) {
  "use server";
  if (String(formData.get("website_confirm") ?? "") !== "") redirect("/unete/gracias"); // honeypot
  const company = String(formData.get("company") ?? "").trim();
  const contact_name = String(formData.get("contact_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const terms = formData.get("terms") === "on";
  if (!company || !email.includes("@") || !terms) redirect("/unete?error=1");

  const sql = await db();
  await sql`
    insert into firms (company, contact_name, email, phone, website, notes)
    values (${company}, ${contact_name}, ${email}, ${phone}, ${website}, ${notes})
    on conflict (email) do update set
      company = excluded.company, contact_name = excluded.contact_name,
      phone = excluded.phone, website = excluded.website, notes = excluded.notes`;

  try {
    await sendMail({ to: email, ...firmReceivedEmail({ company, contact_name }) });
  } catch (e) {
    console.error("firm confirmation failed", e);
  }
  await notifyAdmin(
    `New firm waiting for approval: ${company}`,
    [`${contact_name} · ${email} · ${phone}`, website ? `Web: ${website}` : "", notes ? `Notes: ${notes}` : ""].filter(Boolean),
    { label: "Review and approve", href: `${appUrl()}/admin/firms` },
  );
  redirect("/unete/gracias");
}

export default async function JoinPage(props: { searchParams: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <main className="wrap narrow">
      <p className="kicker">Hispanic Nomad · Leads España</p>
      <h1>Recibe leads de personas que quieren mudarse a España</h1>
      <p>
        Captamos a ciudadanos de Reino Unido, Estados Unidos, Canadá y Australia que quieren vivir en España y les
        decimos qué visado encaja con su caso. Quienes lo piden expresamente reciben una valoración gratuita de hasta{" "}
        {MAX_FIRMS_PER_LEAD} empresas de reubicación. Tú puedes ser una de ellas.
      </p>
      <div className="card" style={{ marginBottom: 20 }}>
        <h3>Cómo funciona</h3>
        <ul className="clean">
          <li>
            Pagas solo por lead recibido: <b>{money(LEAD_PRICE_CENTS)}</b>. Sin cuota ni mínimo.
          </li>
          <li>Cada lead llega a tu email al momento, con nombre, email, teléfono, ruta de visado, ingresos y plazo.</li>
          <li>Solo enviamos leads que han dado su consentimiento, encajan en una ruta (nómada digital, no lucrativa o permiso de trabajo) y quieren mudarse en menos de 12 meses.</li>
          <li>Cada lead se comparte con un máximo de {MAX_FIRMS_PER_LEAD} empresas, por turnos.</li>
          <li>Si los datos de contacto son falsos, lo reportas en {DISPUTE_DAYS} días desde el propio email y no se cobra.</li>
          <li>El día 1 de cada mes recibes un resumen y después la factura.</li>
        </ul>
      </div>

      {searchParams.error ? <p className="notice">Revisa los campos: empresa, email y aceptar las condiciones son obligatorios.</p> : null}

      <form action={signUp} className="stack card">
        <label>
          Empresa
          <input id="company" name="company" type="text" required autoComplete="organization" />
        </label>
        <label>
          Persona de contacto
          <input id="contact_name" name="contact_name" type="text" autoComplete="name" />
        </label>
        <label>
          Email donde quieres recibir los leads
          <input id="email" name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Teléfono
          <input id="phone" name="phone" type="tel" autoComplete="tel" />
        </label>
        <label>
          Web
          <input id="website" name="website" type="url" placeholder="https://" />
        </label>
        <label>
          ¿Algo que debamos saber? (visados que gestionáis, idiomas, ciudades)
          <textarea id="notes" name="notes" rows={3} />
        </label>
        <div className="hp" aria-hidden="true">
          <label>
            No rellenar
            <input id="website_confirm" name="website_confirm" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="check">
          <input id="terms" name="terms" type="checkbox" required />
          <span>
            Acepto recibir leads a {money(LEAD_PRICE_CENTS)} cada uno, compartidos con hasta {MAX_FIRMS_PER_LEAD} empresas, facturados a mes vencido.
            Usaré los datos solo para ofrecer mis servicios a esa persona.
          </span>
        </label>
        <div>
          <button type="submit">Quiero recibir leads</button>
        </div>
      </form>
    </main>
  );
}
