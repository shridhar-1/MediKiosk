import { db } from "@/db";
import { documents, sessions } from "@/db/schema";
import { nid } from "@/lib/ids";
import { extractFromText, SAMPLE_DOCUMENTS } from "@/lib/ocr";
import { structureDocument, readDocumentByVision, mergeWithLabel } from "@/lib/doc-structure";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    imageBase64?: string; // camera photo (downscaled) — for the handwriting vision lane
    ocrConfidence?: number; // Tesseract confidence 0-100 — low means handwriting
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

    // ── Duplicate detection: the same paper must not enter the timeline twice.
  // Patients re-upload the same old prescription at every visit; evaluators
  // re-click the same sample. If this patient already has this exact document
  // (same file + date, or identical text), return the existing row — no AI
  // cost, no duplicate timeline entry, no duplicate lab flags.
  const patientDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.patientId, session.patientId));
  const existing = patientDocs.find(
    (d) =>
      (d.fileName === fileName && d.documentDate === documentDate) ||
      (sourceText.trim().length >= 40 && (d.sourceText ?? "").trim() === sourceText.trim()),
  );
  if (existing) {
    return Response.json({ document: existing, duplicate: true });
  }

  // ── Handwriting pass (feature 5+): weak/no OCR text + a photo → the
  // ── Handwriting pass (feature 5+): weak/no OCR text + a photo → the
  // vision AI reads the image itself and returns structure + a transcript.
  const ocrConfidence = typeof body.ocrConfidence === "number" ? body.ocrConfidence : null;
  const weakText = sourceText.trim().length < 40 || (ocrConfidence !== null && ocrConfidence < 45);
  let visionExtracted: import("@/db/schema").ExtractedDocument | null = null;
  let visionLabel = "";
  let visionDebug = "";
  if (body.imageBase64 && !body.sampleId && weakText) {
    try {
      const v = await readDocumentByVision(body.imageBase64, docType);
      if (v.ok) {
        visionExtracted = v.ok.doc;
        visionLabel = v.ok.label;
        // if Tesseract read nothing (or only garbage), the vision transcript
        // becomes the document's text — searchable, askable, citable
        const useTranscript = !sourceText.trim() || (ocrConfidence !== null && ocrConfidence < 45);
        if (useTranscript && v.ok.transcript.trim()) sourceText = v.ok.transcript;
      } else {
        visionDebug = v.debug;
      }
    } catch (e) {
      visionDebug = e instanceof Error ? e.message : "vision error";
    }
  }

  const localJson = extractFromText(sourceText, docType);

  // ── LLM structuring pass (feature 5): messy paper → clean record ────────
  // Real uploads/pastes only — sample documents keep the instant-demo fast.
  // Regex extraction is the floor; the AI can only ADD unseen items.
  let extractedJson: typeof localJson & { structuredBy?: string } = localJson;
  if (!body.sampleId && visionExtracted) {
    extractedJson = mergeWithLabel(localJson, visionExtracted, visionLabel);
  } else if (!body.sampleId && sourceText.trim().length >= 40) {
    try {
      extractedJson = await structureDocument(sourceText, docType, localJson);
    } catch {
      extractedJson = localJson; // never block an upload on AI
    }
  }

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

  return Response.json({ document: doc, visionDebug: visionDebug || undefined });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");
  if (!docId) return Response.json({ error: "docId required" }, { status: 400 });
  await db.delete(documents).where(eq(documents.id, docId));
  return Response.json({ ok: true });
}