import { db } from "@/db";
import { documents, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { extractFromText, SAMPLE_DOCUMENTS } from "@/lib/ocr";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rows = await db.select().from(documents).where(eq(documents.sessionId, id));
  return Response.json({ documents: rows });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

  const body = (await request.json()) as {
    sampleId?: string;
    docType?: string;
    fileName?: string;
    mimeType?: string;
    sourceText?: string;
    documentDate?: string;
    facilityName?: string;
  };

  let sourceText = body.sourceText ?? "";
  let docType = body.docType ?? "other";
  let fileName = body.fileName ?? "upload.txt";
  let documentDate = body.documentDate ?? new Date().toISOString().slice(0, 10);
  let facilityName = body.facilityName ?? "Patient upload";

  if (body.sampleId) {
    const sample = SAMPLE_DOCUMENTS.find((s) => s.id === body.sampleId);
    if (!sample) return Response.json({ error: "Unknown sample" }, { status: 400 });
    sourceText = sample.sourceText;
    docType = sample.docType;
    fileName = sample.fileName;
    documentDate = sample.documentDate;
    facilityName = sample.facilityName;
  }

  const extractedJson = extractFromText(sourceText, docType);

  const [doc] = await db
    .insert(documents)
    .values({
      id: nid(),
      sessionId: id,
      patientId: session.patientId,
      docType,
      fileName,
      mimeType: body.mimeType ?? "text/plain",
      sourceText,
      extractedJson,
      documentDate,
      facilityName,
    })
    .returning();

  return Response.json({ document: doc });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");
  if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
  await db.delete(documents).where(eq(documents.id, docId));
  return Response.json({ ok: true });
}
