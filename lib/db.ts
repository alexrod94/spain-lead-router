import postgres from "postgres";
import { env } from "./config";

type Sql = ReturnType<typeof postgres>;

const globalForSql = globalThis as unknown as { __sql?: Sql; __schema?: Promise<void> };

export function sql(): Sql {
  if (!globalForSql.__sql) {
    const url = env("DATABASE_URL");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    globalForSql.__sql = postgres(url, { ssl: local ? false : "require", max: local ? 1 : 5, idle_timeout: 20 });
  }
  return globalForSql.__sql;
}

// Creates the tables on first use, so there is no separate migration step.
export function ensureSchema(): Promise<void> {
  if (!globalForSql.__schema) {
    const db = sql();
    globalForSql.__schema = (async () => {
      await db.unsafe(`
        create table if not exists firms (
          id uuid primary key default gen_random_uuid(),
          company text not null,
          contact_name text not null default '',
          email text not null unique,
          phone text not null default '',
          website text not null default '',
          notes text not null default '',
          status text not null default 'pending' check (status in ('pending','active','paused','rejected')),
          price_cents integer not null default 3000,
          monthly_cap integer,
          last_assigned_at timestamptz,
          approved_at timestamptz,
          created_at timestamptz not null default now()
        );
        create table if not exists leads (
          id uuid primary key default gen_random_uuid(),
          dedupe_key text not null unique,
          name text not null default '',
          email text not null default '',
          phone text not null default '',
          citizenship text not null default '',
          income_source text not null default '',
          monthly_income text not null default '',
          household text not null default '',
          timeline text not null default '',
          route text not null default '',
          consent boolean not null default false,
          sellable boolean not null default false,
          reason text not null default '',
          source text not null default '',
          raw jsonb,
          created_at timestamptz not null default now()
        );
        create table if not exists deliveries (
          id uuid primary key default gen_random_uuid(),
          lead_id uuid not null references leads(id) on delete cascade,
          firm_id uuid not null references firms(id) on delete cascade,
          price_cents integer not null,
          status text not null default 'sent' check (status in ('queued','sent','failed','disputed','credited')),
          dispute_token text not null unique,
          dispute_reason text not null default '',
          disputed_at timestamptz,
          resolved_at timestamptz,
          email_id text not null default '',
          error text not null default '',
          created_at timestamptz not null default now(),
          unique (lead_id, firm_id)
        );
        create table if not exists statements (
          id uuid primary key default gen_random_uuid(),
          firm_id uuid not null references firms(id) on delete cascade,
          month text not null,
          lead_count integer not null default 0,
          amount_cents integer not null default 0,
          emailed_at timestamptz,
          invoiced_at timestamptz,
          paid_at timestamptz,
          unique (firm_id, month)
        );
        create index if not exists deliveries_firm_created on deliveries (firm_id, created_at);
        create index if not exists leads_created on leads (created_at desc);
      `);
    })().catch((e) => {
      globalForSql.__schema = undefined;
      throw e;
    });
  }
  return globalForSql.__schema;
}

export async function db(): Promise<Sql> {
  await ensureSchema();
  return sql();
}

export type Firm = {
  id: string;
  company: string;
  contact_name: string;
  email: string;
  phone: string;
  website: string;
  notes: string;
  status: "pending" | "active" | "paused" | "rejected";
  price_cents: number;
  monthly_cap: number | null;
  last_assigned_at: Date | null;
  approved_at: Date | null;
  created_at: Date;
};

export type Lead = {
  id: string;
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
  sellable: boolean;
  reason: string;
  source: string;
  created_at: Date;
};

export type Delivery = {
  id: string;
  lead_id: string;
  firm_id: string;
  price_cents: number;
  status: "queued" | "sent" | "failed" | "disputed" | "credited";
  dispute_token: string;
  dispute_reason: string;
  disputed_at: Date | null;
  resolved_at: Date | null;
  email_id: string;
  error: string;
  created_at: Date;
};
