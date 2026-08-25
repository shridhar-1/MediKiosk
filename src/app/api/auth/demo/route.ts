import { db } from "@/db";
import { patients, staff } from "@/db/schema";
import { createAuthSession, hashSecret, normalizeEmail } from "@/lib/auth";
import { formatAbha, nid } from "@/lib/ids";
import { seedIfEmpty } from "@/lib/seed";
import { asc, desc, eq, or } from "drizzle-orm";

export const dynamic = "force-dynamic";

type Body = {
  kind?: "patient" | "staff";
  identifier?: string;
  fullName?: string;
  age?: string | number;
  gender?: string;
  phone?: string;
  abhaId?: string;
  preferredLanguage?: string;
  email?: string;
};

export async function POST(request: Request) {
  await seedIfEmpty();

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  if (body.kind === "staff") {
    const email = normalizeEmail(body.email ?? "");
    const name = (body.fullName ?? "").trim();

    let member = email
      ? (await db.select().from(staff).where(eq(staff.email, email)).limit(1))[0]
      : undefined;

    if (!member && (email || name)) {
      [member] = await db
        .insert(staff)
        .values({
          id: nid(),
          email: email || `guest-${Date.now()}@medikiosk.in`,
          passwordHash: hashSecret(nid()),
          fullName: name || deriveName(email) || "Duty Clinician",
          role: "physician",
          designation: "Duty Clinician",
          department: "general_medicine",
          hospital: "District Hospital, Narela",
        })
        .returning();
    }

    if (!member) {
      [member] = await db.select().from(staff).orderBy(asc(staff.createdAt)).limit(1);
    }

    await db.update(staff).set({ lastLoginAt: new Date() }).where(eq(staff.id, member.id));
    await createAuthSession("staff", member.id);
    return Response.json({ staff: { id: member.id, fullName: member.fullName, role: member.role } });
  }

  const identifier = (body.identifier ?? "").trim();
  const digits = identifier.replace(/\D/g, "") || (body.phone ?? "").replace(/\D/g, "");
  const abhaCandidate = digits.length >= 12 ? formatAbha(identifier || digits) : (body.abhaId ? formatAbha(body.abhaId) : "");
  const name = (body.fullName ?? "").trim();

  let patient =
    digits.length === 10 || abhaCandidate
      ? (
          await db
            .select()
            .from(patients)
            .where(
              abhaCandidate && digits.length === 10
                ? or(eq(patients.phone, digits), eq(patients.abhaId, abhaCandidate))
                : abhaCandidate
                  ? eq(patients.abhaId, abhaCandidate)
                  : eq(patients.phone, digits),
            )
            .limit(1)
        )[0]
      : undefined;

  if (!patient && (name || digits || abhaCandidate)) {
    [patient] = await db
      .insert(patients)
      .values({
        id: nid(),
        abhaId: abhaCandidate || null,
        aadhaarLast4: null,
        fullName: name || (digits ? `Patient ${digits.slice(-4)}` : "Guest Patient"),
        age: Number(body.age) || 30,
        gender: body.gender ?? "other",
        phone: digits.length === 10 ? digits : null,
        preferredLanguage: body.preferredLanguage ?? "en",
        pinHash: null,
      })
      .returning();
  }

  if (!patient) {
    // FIXED: asc = Priya (oldest). Now desc = most recent
    [patient] = await db.select().from(patients).orderBy(desc(patients.createdAt)).limit(1);
  }

  if (!patient) {
    return Response.json({ error: "No patients found, please register" }, { status: 404 });
  }

  await createAuthSession("patient", patient.id);
  return Response.json({
    patient: { id: patient.id, fullName: patient.fullName, preferredLanguage: patient.preferredLanguage },
  });
}

function deriveName(email: string): string {
  const handle = email.split("@")[0] ?? "";
  if (!handle) return "";
  return handle
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}