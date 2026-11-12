import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead Router" };

export default async function PanelLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <main className="wrap" lang="en">
      <nav className="admin">
        <b style={{ marginRight: 8 }}>Lead Router</b>
        <Link href="/admin">Overview</Link>
        <Link href="/admin/leads">Leads</Link>
        <Link href="/admin/firms">Firms</Link>
        <Link href="/admin/billing">Billing</Link>
        <span className="spacer" />
        <form action={logoutAction}>
          <button className="ghost small" type="submit">
            Sign out
          </button>
        </form>
      </nav>
      {children}
    </main>
  );
}
