import { NextResponse } from "next/server";
import { bearerOk } from "@/lib/auth";
import { sendMonthlyStatements } from "@/lib/statements";
import { previousMonthKey } from "@/lib/routing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron calls this at 09:00 UTC on the 1st with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  if (!bearerOk(req, "CRON_SECRET")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const month = new URL(req.url).searchParams.get("month") ?? previousMonthKey();
  const result = await sendMonthlyStatements(month);
  return NextResponse.json({ ok: true, month, ...result });
}
