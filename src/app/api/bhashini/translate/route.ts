import { bhashiniTranslateDetailed } from "@/lib/bhashini";

export const dynamic = "force-dynamic";

// Body: { text: string, source?: string (default "en"), target?: string (default "hi") }
// Returns { translated } on success, or { translated: null, step, error }
// so integration problems are visible instead of silent nulls.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      source?: string;
      target?: string;
    };
    const text = (body.text ?? "").trim();
    if (!text) return Response.json({ error: "text required" }, { status: 400 });

    const source = body.source ?? "en";
    const target = body.target ?? "hi";
    const result = await bhashiniTranslateDetailed(text, source, target);
    return Response.json({
      translated: result.translated,
      source,
      target,
      ...(result.error ? { step: result.step, error: result.error } : {}),
    });
  } catch (error: any) {
    console.error("POST bhashini/translate error:", error);
    return Response.json({ error: error?.message || "Failed" }, { status: 500 });
  }
}