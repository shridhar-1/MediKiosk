import { db } from "@/db";
import { patients } from "@/db/schema";
import { formatAbha, nid } from "@/lib/ids";
import { and, eq, ilike, isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const abha = searchParams.get("abha");
  const q = searchParams.get("q");
  if (abha) {
    const formatted = formatAbha(abha);
    const rows = await db.select().from(patients).where(eq(patients.abhaId, formatted)).limit(5);
    return Response.json({ patients: rows });
  }
  if (q && q.trim().length >= 2) {
    const rows = await db
      .select()
      .from(patients)
      .where(ilike(patients.fullName, `%${q.trim()}%`))
      .limit(8);
    return Response.json({ patients: rows });
  }
  const rows = await db.select().from(patients);
  return Response.json({ patients: rows });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    abhaId?: string;
    aadhaarLast4?: string;
    fullName: string;
    age: number;
    gender: string;
    phone?: string;
    preferredLanguage?: string;
  };

  if (!body.fullName || !body.age || !body.gender) {
    return Response.json({ error: "Name, age and gender are required" }, { status: 400 });
  }

  const abhaId = body.abhaId ? formatAbha(body.abhaId) : null;

  if (abhaId) {
    const [existing] = await db.select().from(patients).where(eq(patients.abhaId, abhaId)).limit(1);
    if (existing) {
      const [updated] = await db
        .update(patients)
        .set({
          fullName: body.fullName,
          age: Number(body.age),
          gender: body.gender,
          phone: body.phone ?? existing.phone,
          preferredLanguage: body.preferredLanguage ?? existing.preferredLanguage,
          aadhaarLast4: body.aadhaarLast4 ?? existing.aadhaarLast4,
        })
        .where(eq(patients.id, existing.id))
        .returning();
      return Response.json({ patient: updated, existing: true });
    }
  }

  if (body.aadhaarLast4 && body.fullName) {
    const [existing] = await db
      .select()
      .from(patients)
      .where(
        and(eq(patients.aadhaarLast4, body.aadhaarLast4), eq(patients.fullName, body.fullName)),
      )
      .limit(1);
    if (existing) {
      return Response.json({ patient: existing, existing: true });
    }
  }

  // ── PHONE DE-DUPE (fixes "history gone") ────────────────────────────────
  // Before creating a new patient, look for an existing one with the SAME
  // phone number (compared on the last 10 digits, so +91 / 91 / 10-digit all
  // match). Reuse that record so all visits stay on ONE patient history.
  if (body.phone) {
    const digits = body.phone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      const withPhone = await db.select().from(patients).where(isNotNull(patients.phone));
      const existing = withPhone.find(
        (p) => (p.phone ?? "").replace(/\D/g, "").slice(-10) === digits,
      );
      if (existing) {
        const [updated] = await db
          .update(patients)
          .set({
            fullName: body.fullName ?? existing.fullName,
            age: Number(body.age) || existing.age,
            gender: body.gender ?? existing.gender,
            preferredLanguage: body.preferredLanguage ?? existing.preferredLanguage,
            aadhaarLast4: body.aadhaarLast4 ?? existing.aadhaarLast4,
          })
          .where(eq(patients.id, existing.id))
          .returning();
        return Response.json({ patient: updated, existing: true });
      }
    }
  }

  const [patient] = await db
    .insert(patients)
    .values({
      id: nid(),
      abhaId,
      aadhaarLast4: body.aadhaarLast4 ?? null,
      fullName: body.fullName.trim(),
      age: Number(body.age),
      gender: body.gender,
      phone: body.phone ?? null,
      preferredLanguage: body.preferredLanguage ?? "en",
    })
    .returning();

  return Response.json({ patient, existing: false });
}