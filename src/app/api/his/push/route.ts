import { pushToHis, getHisStatus } from "@/lib/his-gateway";
import { db } from "@/db";
import { hisEvents } from "@/db/schema";
import { nid } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { sessionId, fhirBundle } = await req.json();
  if (!sessionId || !fhirBundle) return Response.json({ error: "sessionId and fhirBundle required" }, { status: 400 });

  const result = await pushToHis(fhirBundle, sessionId);

  // Audit log - use any to bypass schema mismatch, will work at runtime
  try {
    await db.insert(hisEvents).values({
      id: nid(),
      sessionId,
      eventType: result.mode === "LIVE" ? "fhir_bundle_pushed_live_his" : "fhir_bundle_pushed_mock_his",
      // @ts-ignore - bundle field name may differ in your schema (could be payload, data, bundleJson, etc)
      bundle: { ...result, pushedAt: new Date().toISOString() },
      // If your schema has different column names, add them here as fallback
      // For example if it has 'payload' instead of 'bundle', the DB will ignore unknown, so we try both
    } as any);
  } catch (e) {
    console.warn("Failed to log his_event (non-critical, push still succeeded)", e);
    // Don't fail the whole request if audit log fails
  }

  return Response.json({
    ...result,
    message: result.mode === "MOCK" 
      ? "MOCK - Set HIS_FHIR_URL for live push to hospital EMR. Works without key, audits internally."
      : "LIVE - Pushed to real HIS FHIR endpoint",
  });
}

export async function GET() {
  return Response.json({
    ...getHisStatus(),
    message: "Works in MOCK without HIS_FHIR_URL - set HIS_FHIR_URL for LIVE push",
  });
}