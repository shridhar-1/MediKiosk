import { db } from "@/db";
import { patients, staff } from "@/db/schema";
import { createAuthSession, hashSecret, normalizeEmail } from "@/lib/auth";
import { formatAbha, nid } from "@/lib/ids";
import { seedIfEmpty } from "@/lib/seed";
import { asc, desc, eq, isNotNull } from "drizzle-orm";

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
  const rawDigits = identifier.replace(/\D/g, "") || (body.phone ?? "").replace(/\D/g, "");
  
  // ── PHONE NORMALIZATION FIX ─────────────────────────────────────────────
  // "+919876543210" / "919876543210" → "9876543210". Previously a +91 number
  // became 12 digits, was mistaken for an ABHA candidate, matched nothing and
  // created a brand-new disconnected patient on every login (→ "my history
  // is gone"). Now the phone is normalized FIRST and matched on last 10 digits.
  const digits = rawDigits.length === 12 && rawDigits.startsWith("91") ? rawDigits.slice(-10) : rawDigits;
  
  // ABHA numbers are 14 digits — only treat as ABHA when long enough (a +91
  // phone at 12 digits must NOT be confused with an ABHA id).
  const abhaCandidate = rawDigits.length >= 13 ? formatAbha(identifier || rawDigits) : (body.abhaId ? formatAbha(body.abhaId) : "");
  const name = (body.fullName ?? "").trim();

  let patient: typeof patients.$inferSelect | undefined;
  if (digits.length === 10) {
    const withPhone = await db.select().from(patients).where(isNotNull(patients.phone));
    patient = withPhone.find((p) => (p.phone ?? "").replace(/\D/g, "").slice(-10) === digits);
  }
  if (!patient && abhaCandidate) {
    [patient] = await db.select().from(patients).where(eq(patients.abhaId, abhaCandidate)).limit(1);
  }

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
    .replace(/[._-]+/g, " ") // FIXED: Added missing closing slash for the regex literal
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}