import { destroySession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  await destroySession(kind === "patient" || kind === "staff" ? kind : "all");
  return Response.json({ ok: true });
}
