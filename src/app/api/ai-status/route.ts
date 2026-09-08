export const dynamic = "force-dynamic";

// GET /api/ai-status — which AI engines are configured on THIS deployment.
// Booleans only (never leaks key values). Debug + demo tool: shows the
// multi-provider lanes and the honest fallbacks behind them.
export async function GET() {
  return Response.json({
    engines: {
      groq: Boolean(process.env.GROQ_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
      ollama: Boolean(process.env.OLLAMA_BASE_URL),
      bhashini: Boolean(process.env.BHASHINI_USER_ID && process.env.BHASHINI_ULCA_API_KEY),
    },
    models: {
      groq: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      ollama: process.env.OLLAMA_MODEL || "llama3.1",
      geminiTries: ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-flash-latest"],
    },
    note: "Missing engines are not errors — the AI router falls to the next lane, and the deterministic rules floor always runs.",
  });
}