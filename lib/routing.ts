// Pure rules: no database or network here, so they can be unit tested.
import { MAX_FIRMS_PER_LEAD, SELLABLE_ROUTES, SELLABLE_TIMELINES } from "./config";

export type LeadInput = {
  name: string;
  email: string;
  phone: string;
  citizenship: string;
  income_source: string;
  monthly_income: string;
  household: string;
  timeline: string;
  route: string;
  consent: boolean;
  source: string;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

export function isTruthy(v: unknown): boolean {
  if (v === true) return true;
  return /^(yes|true|1|on|s[ií]|checked|ticked)$/i.test(str(v));
}

// Accepts the JSON the Pinball automation posts. Keys are documented in the README.
export function normalizeLead(body: Record<string, unknown>): LeadInput {
  return {
    name: str(body.name),
    email: str(body.email).toLowerCase(),
    phone: str(body.phone),
    citizenship: str(body.citizenship),
    income_source: str(body.income_source),
    monthly_income: str(body.monthly_income),
    household: str(body.household),
    timeline: str(body.timeline),
    route: str(body.outcome ?? body.route),
    consent: isTruthy(body.consent),
    source: str(body.utm_content ?? body.source),
  };
}

export type SellableResult = { sellable: boolean; reason: string };

export function sellableCheck(lead: Pick<LeadInput, "consent" | "route" | "timeline" | "email">): SellableResult {
  if (!lead.email || !lead.email.includes("@")) return { sellable: false, reason: "no_email" };
  if (!lead.consent) return { sellable: false, reason: "no_consent" };
  if (!SELLABLE_ROUTES.includes(lead.route)) return { sellable: false, reason: "route_not_sold" };
  if (!SELLABLE_TIMELINES.includes(lead.timeline)) return { sellable: false, reason: "timeline_too_far" };
  return { sellable: true, reason: "ok" };
}

export type FirmCandidate = {
  id: string;
  createdAt: Date;
  lastAssignedAt: Date | null;
  monthCount: number; // leads delivered to this firm in the current month
  monthlyCap: number | null;
};

// Fair rotation: firms that have waited longest go first; a firm that has
// never received a lead goes before everyone; firms at their monthly cap are skipped.
export function pickFirms(candidates: FirmCandidate[], max = MAX_FIRMS_PER_LEAD): string[] {
  return candidates
    .filter((f) => f.monthlyCap === null || f.monthCount < f.monthlyCap)
    .sort((a, b) => {
      const at = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -Infinity;
      const bt = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -Infinity;
      if (at !== bt) return at - bt;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, Math.max(0, max))
    .map((f) => f.id);
}

// Same person, same answers, same day = one lead (protects firms from double billing).
export function dedupeKey(lead: Pick<LeadInput, "email" | "route" | "timeline">, when = new Date()): string {
  return [lead.email.toLowerCase(), lead.route, lead.timeline, when.toISOString().slice(0, 10)].join("|");
}

export function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export function previousMonthKey(d = new Date()): string {
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return monthKey(p);
}

export function monthRange(key: string): { start: Date; end: Date } {
  const [y, m] = key.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}
