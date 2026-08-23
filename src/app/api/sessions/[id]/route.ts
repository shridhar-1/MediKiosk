import { db } from "@/db";
import { sessions } from "@/db/schema";
import { loadSessionBundle } from "@/lib/session-data";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bundle = await loadSessionBundle(id);
  if (!bundle) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(bundle);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    status?: string;
    department?: string;
    mode?: string;
    language?: string;
    physicianNotes?: string;
    priority?: string;
  };

  const [updated] = await db
    .update(sessions)
    .set({
      ...(body.status ? { status: body.status } : {}),
      ...(body.department ? { department: body.department } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.language ? { language: body.language } : {}),
      ...(body.physicianNotes !== undefined ? { physicianNotes: body.physicianNotes } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
    })
    .where(eq(sessions.id, id))
    .returning();

  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ session: updated });
}
