// Business rules for the Spain Pay Per Lead programme. Change them here.

export const LEAD_PRICE_CENTS = 3000; // €30 default per lead (each firm can have its own price)
export const MAX_FIRMS_PER_LEAD = 3; // the quiz consent says "up to three firms"
export const DISPUTE_DAYS = 7; // firms can report fake contact details within this window
export const CURRENCY = "EUR";

// A lead is sold only when the person ticked the consent box AND
// their result is one of these routes AND they plan to move within 12 months.
// Values are the ending names / option labels used in the Pinball quiz.
export const SELLABLE_ROUTES = ["Digital Nomad Visa", "Non-Lucrative Visa", "Work permit"];
export const SELLABLE_TIMELINES = ["Within 3 months", "In 3 to 6 months", "In 6 to 12 months"];

// Spanish labels for the firm-facing emails and pages.
export const ES: Record<string, string> = {
  "Digital Nomad Visa": "Visado de nómada digital",
  "Non-Lucrative Visa": "Visado de residencia no lucrativa",
  "Work permit": "Permiso de trabajo (oferta de empresa española)",
  "EU citizen (no visa)": "Ciudadano UE (sin visado)",
  "Needs a closer look": "Pendiente de valorar",
  "Within 3 months": "en menos de 3 meses",
  "In 3 to 6 months": "en 3 a 6 meses",
  "In 6 to 12 months": "en 6 a 12 meses",
  "More than a year from now": "en más de un año",
  "Just exploring for now": "solo explorando",
  "United Kingdom": "Reino Unido",
  "United States": "Estados Unidos",
  Canada: "Canadá",
  "Australia or New Zealand": "Australia o Nueva Zelanda",
  "An EU or EEA country, or Switzerland": "UE / EEE / Suiza",
  "Another non-EU country": "Otro país fuera de la UE",
  "A remote job for a company outside Spain": "Trabajo en remoto para una empresa de fuera de España",
  "Freelance work or my own business, with clients outside Spain": "Autónomo o negocio propio, con clientes fuera de España",
  "Pension, savings, investments or rental income": "Pensión, ahorros, inversiones o alquileres",
  "A job offer from a company in Spain": "Oferta de trabajo de una empresa española",
  "Not sure yet": "Aún no lo sabe",
  "Under €2,400": "Menos de 2.400 €",
  "€2,400 to €2,850": "2.400 € – 2.850 €",
  "€2,850 to €4,500": "2.850 € – 4.500 €",
  "Over €4,500": "Más de 4.500 €",
  "Just me": "Solo él/ella",
  "Me and my partner": "En pareja",
  "A family with children": "Familia con hijos",
};

export function es(value: string | null | undefined): string {
  if (!value) return "—";
  return ES[value] ?? value;
}

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function money(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: CURRENCY }).format(cents / 100);
}
