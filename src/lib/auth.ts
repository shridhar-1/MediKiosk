import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { authSessions, patients, staff, type Patient, type Staff } from "@/db/schema";
import { and, asc, eq, gt } from "drizzle-orm";

export const PATIENT_COOKIE = "mk_patient";
export const STAFF_COOKIE = "mk_staff";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(secret, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, digest] = stored.split(":");
  if (!salt || !digest) return false;
  const derived = scryptSync(secret, salt, 64);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createAuthSession(
  subjectType: "patient" | "staff",
  subjectId: string,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  await db.insert(authSessions).values({
    id: randomUUID(),
    token,
    subjectType,
    subjectId,
    expiresAt,
  });

  const jar = await cookies();
  jar.set(subjectType === "patient" ? PATIENT_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  return token;
}

async function resolve(cookieName: string, subjectType: "patient" | "staff") {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(authSessions)
    .where(
      and(
        eq(authSessions.token, token),
        eq(authSessions.subjectType, subjectType),
        gt(authSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function currentPatient(): Promise<Patient | null> {
  const row = await resolve(PATIENT_COOKIE, "patient");
  if (!row) return null;
  const [patient] = await db.select().from(patients).where(eq(patients.id, row.subjectId)).limit(1);
  return patient ?? null;
}

export async function currentStaff(): Promise<Staff | null> {
  const row = await resolve(STAFF_COOKIE, "staff");
  if (!row) return null;
  const [member] = await db.select().from(staff).where(eq(staff.id, row.subjectId)).limit(1);
  if (!member || !member.active) return null;
  return member;
}

/**
 * Demo mode: sections are open. If nobody is "signed in", fall back to a
 * seeded identity so the visitor can explore without a credential wall.
 */
export async function patientOrDemo(): Promise<Patient | null> {
  const signedIn = await currentPatient();
  if (signedIn) return signedIn;
  const [fallback] = await db.select().from(patients).orderBy(asc(patients.createdAt)).limit(1);
  return fallback ?? null;
}

export async function staffOrDemo(): Promise<Staff | null> {
  const signedIn = await currentStaff();
  if (signedIn) return signedIn;
  const [fallback] = await db.select().from(staff).orderBy(asc(staff.createdAt)).limit(1);
  return fallback ?? null;
}

export async function destroySession(kind: "patient" | "staff" | "all"): Promise<void> {
  const jar = await cookies();
  const targets =
    kind === "all"
      ? ([
          [PATIENT_COOKIE, "patient"],
          [STAFF_COOKIE, "staff"],
        ] as const)
      : kind === "patient"
        ? ([[PATIENT_COOKIE, "patient"]] as const)
        : ([[STAFF_COOKIE, "staff"]] as const);

  for (const [cookieName] of targets) {
    const token = jar.get(cookieName)?.value;
    if (token) {
      await db.delete(authSessions).where(eq(authSessions.token, token));
    }
    jar.delete(cookieName);
  }
}
