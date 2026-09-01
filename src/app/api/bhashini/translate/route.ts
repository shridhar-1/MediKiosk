import { bhashiniTranslate, isBhashiniConfigured } from "@/lib/bhashini";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/bhashini/translate
// Body: { text: string, source?: string (default "en"), target?: string (default "hi") }
export async function POST(request: Request) {
  try {
    if (!isBhashiniConfigured()) {
      return Response.json(
        {
          translated: null,
          reason:
            "Bhashini keys not set. Add BHASHINI_USER_ID and BHASHINI_ULCA_API_KEY in Vercel env, then redeploy.",
        },
        { status: 200 },
      );
    }
    const body = (await request.json()) as {
      text?: string;
      source?: string;
      target?: string;
    };
    const text = (body.text ?? "").trim();
    if (!text) {
      return Response.json({ error: "text required" }, { status: 400 });
    }
    const source = body.source ?? "en";
    const target = body.target ?? "hi";
    const translated = await bhashiniTranslate(text, source, target);
    return Response.json({ translated, source, target });
  } catch (error: any) {
    console.error("POST /api/bhashini/translate error:", error);
    return Response.json(
      { error: error?.message || "Translation failed" },
      { status: 500 },
    );
  }
}