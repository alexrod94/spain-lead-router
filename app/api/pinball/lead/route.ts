import { NextResponse } from "next/server";
import { bearerOk } from "@/lib/auth";
import { intakeLead } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Pinball's "Spain visa check → Lead router" automation posts here on every finished quiz.
export async function POST(req: Request) {
  if (!bearerOk(req, "PINBALL_WEBHOOK_SECRET")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      body = (await req.json()) as Record<string, unknown>;
    } else {
      const form = await req.formData();
      body = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }

  try {
    const result = await intakeLead(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("intake failed", e);
    // 500 lets Pinball retry the webhook.
    return NextResponse.json({ ok: false, error: "intake failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "spain-lead-router" });
}
