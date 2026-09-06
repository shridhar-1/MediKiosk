// ── AI Router: every task gets its own engine lane ────────────────────────
// Free tiers have rate limits (Groq ≈30 req/min, Gemini ≈15 req/min on free
// plans). If summaries, Q&A and voice all hit the same engine, one busy demo
// can trip a limit. So each TASK runs on its own priority lane, with the
// other engines as fallbacks — load is spread, never concentrated.
//
//   Task          Laptop (dev/demo)           Vercel (production)
//   ───────────   ─────────────────────────   ─────────────────────────
//   summary       ollama → groq → gemini      groq → gemini
//   ask (Q&A)     ollama → groq → gemini      GEMINI → groq   (lane split!)
//   voice (ASR)   Groq Whisper (fixed lane — has its own pool)
//
// Lane logic:
//   • On the cloud, summaries go Groq-first, interactive Q&A goes
//     Gemini-first → two features never compete for the same rate limit.
//   • On the laptop, local Ollama always goes first (free, offline, private)
//     so the free cloud tiers are barely touched during dev.
//
// Overrides (in .env / Vercel), no code changes needed:
//   AI_ENGINE=ollama                    force everything local (offline demo)
//   AI_ENGINE_SUMMARY=groq,gemini       per-lane override for summaries
//   AI_ENGINE_ASK=gemini,groq           per-lane override for Q&A

export type AiTask = "summary" | "ask";
export type EngineId = "ollama" | "groq" | "gemini";

const VALID: EngineId[] = ["ollama", "groq", "gemini"];

function parseList(value: string | undefined): EngineId[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v): v is EngineId => VALID.includes(v as EngineId));
}

export function engineOrder(task: AiTask): EngineId[] {
  // 1) Global force (offline demo mode)
  const force = (process.env.AI_ENGINE || "auto").toLowerCase();
  if (force === "ollama") return ["ollama"];
  if (force === "groq") return ["groq", "gemini"];
  if (force === "gemini") return ["gemini"];

  // 2) Per-lane override: AI_ENGINE_SUMMARY=... / AI_ENGINE_ASK=...
  const lane = parseList(process.env[`AI_ENGINE_${task.toUpperCase()}`]);
  if (lane.length > 0) return lane;

  // 3) Defaults per environment
  const cloud = Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
  if (task === "summary") {
    if (!cloud) return ["ollama", "groq", "gemini"];
    return process.env.GROQ_API_KEY
      ? ["groq", "gemini"]
      : process.env.GEMINI_API_KEY
        ? ["gemini"]
        : ["groq", "gemini"];
  }
  // ask: on the cloud Gemini takes this lane so Groq is left free for
  // summaries + voice (rate limits are per-provider — lanes never compete)
  if (!cloud) return ["ollama", "groq", "gemini"];
  return process.env.GEMINI_API_KEY ? ["gemini", "groq"] : ["groq", "gemini"];
}