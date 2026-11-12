import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, isTruthy, monthRange, normalizeLead, pickFirms, previousMonthKey, sellableCheck } from "../lib/routing";

const d = (s: string) => new Date(s);

test("never-assigned firms go first, then the longest-waiting", () => {
  const picked = pickFirms(
    [
      { id: "a", createdAt: d("2026-01-01"), lastAssignedAt: d("2026-11-10"), monthCount: 0, monthlyCap: null },
      { id: "b", createdAt: d("2026-01-02"), lastAssignedAt: d("2026-11-01"), monthCount: 0, monthlyCap: null },
      { id: "c", createdAt: d("2026-01-03"), lastAssignedAt: null, monthCount: 0, monthlyCap: null },
      { id: "e", createdAt: d("2026-01-05"), lastAssignedAt: d("2026-11-11"), monthCount: 0, monthlyCap: null },
    ],
    3,
  );
  assert.deepEqual(picked, ["c", "b", "a"]);
});

test("firms at their monthly cap are skipped", () => {
  const picked = pickFirms([
    { id: "full", createdAt: d("2026-01-01"), lastAssignedAt: null, monthCount: 10, monthlyCap: 10 },
    { id: "open", createdAt: d("2026-01-02"), lastAssignedAt: d("2026-11-01"), monthCount: 9, monthlyCap: 10 },
  ]);
  assert.deepEqual(picked, ["open"]);
});

test("rotation spreads leads evenly across five firms", () => {
  const firms = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, createdAt: new Date(2026, 0, i + 1), lastAssignedAt: null as Date | null, monthCount: 0, monthlyCap: null }));
  const counts: Record<string, number> = {};
  let clock = Date.UTC(2026, 10, 1);
  for (let i = 0; i < 50; i++) {
    for (const id of pickFirms(firms, 3)) {
      counts[id] = (counts[id] ?? 0) + 1;
      const f = firms.find((x) => x.id === id)!;
      f.lastAssignedAt = new Date((clock += 1000));
    }
  }
  assert.deepEqual(Object.values(counts).sort(), [30, 30, 30, 30, 30]);
});

test("ties on time fall back to sign-up order, and max limits the result", () => {
  assert.deepEqual(
    pickFirms(
      [
        { id: "late", createdAt: d("2026-03-01"), lastAssignedAt: null, monthCount: 0, monthlyCap: null },
        { id: "early", createdAt: d("2026-02-01"), lastAssignedAt: null, monthCount: 0, monthlyCap: null },
      ],
      1,
    ),
    ["early"],
  );
  assert.deepEqual(pickFirms([], 3), []);
});

test("sellable needs consent, a sold route and a timeline within 12 months", () => {
  const base = { email: "a@b.com", consent: true, route: "Digital Nomad Visa", timeline: "In 3 to 6 months" };
  assert.deepEqual(sellableCheck(base), { sellable: true, reason: "ok" });
  assert.equal(sellableCheck({ ...base, consent: false }).reason, "no_consent");
  assert.equal(sellableCheck({ ...base, route: "Needs a closer look" }).reason, "route_not_sold");
  assert.equal(sellableCheck({ ...base, route: "EU citizen (no visa)" }).reason, "route_not_sold");
  assert.equal(sellableCheck({ ...base, timeline: "Just exploring for now" }).reason, "timeline_too_far");
  assert.equal(sellableCheck({ ...base, email: "" }).reason, "no_email");
  assert.equal(sellableCheck({ ...base, route: "Work permit", timeline: "Within 3 months" }).sellable, true);
  assert.equal(sellableCheck({ ...base, route: "Non-Lucrative Visa", timeline: "In 6 to 12 months" }).sellable, true);
});

test("consent values from Pinball are read correctly", () => {
  for (const v of [true, "Yes", "yes", "true", "1", "Sí", "checked"]) assert.equal(isTruthy(v), true, String(v));
  for (const v of [false, "No", "", "false", "0", null, undefined]) assert.equal(isTruthy(v), false, String(v));
});

test("normalizeLead maps the Pinball payload and lowercases email", () => {
  const lead = normalizeLead({
    name: " Jane ", email: "Jane@Example.COM", phone: "+44 7700 900123", citizenship: "United Kingdom",
    income_source: "A remote job for a company outside Spain", monthly_income: "€2,850 to €4,500",
    household: "Just me", timeline: "Within 3 months", outcome: "Digital Nomad Visa", consent: "Yes", utm_content: "1-pain-red",
  });
  assert.equal(lead.name, "Jane");
  assert.equal(lead.email, "jane@example.com");
  assert.equal(lead.route, "Digital Nomad Visa");
  assert.equal(lead.consent, true);
  assert.equal(lead.source, "1-pain-red");
});

test("dedupe key is per person, answers and day", () => {
  const a = dedupeKey({ email: "A@b.com", route: "Work permit", timeline: "Within 3 months" }, d("2026-11-12T10:00:00Z"));
  const b = dedupeKey({ email: "a@b.com", route: "Work permit", timeline: "Within 3 months" }, d("2026-11-12T23:00:00Z"));
  const c = dedupeKey({ email: "a@b.com", route: "Work permit", timeline: "Within 3 months" }, d("2026-11-13T01:00:00Z"));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("month helpers", () => {
  assert.equal(previousMonthKey(d("2026-01-15T00:00:00Z")), "2025-12");
  const { start, end } = monthRange("2026-12");
  assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2027-01-01T00:00:00.000Z");
});
