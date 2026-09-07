// ── Chat-Intake extraction: free speech → structured interview answers ────
// MULTI-TURN, CONTEXT-AWARE: the patient chats freely (any of 7 languages),
// the AI extracts the SAME structured fields the guided interview collects,
// detects what is MISSING, and asks one focused follow-up at a time. Every
// turn re-runs the deterministic safety engines — red flags, drug–drug,
// drug–allergy — so emergencies surface mid-conversation, not at the end.
//
// Non-medical messages (greetings, "test", chit-chat) get a proper
// conversational reply — never a fake medical file. No AI reachable →
// honest naive parser with deterministic follow-ups.

import { engineOrder } from "@/lib/ai-router";

export type ExtractedIntake = {
  chiefComplaint: string;
  durationText: string;
  severity: string; // "1".."10" or ""
  medications: string[]; // [] = none reported
  allergies: string[]; // [] = none reported
  pastMedical: string;
  familyHistory: string;
  tobacco: string; // "" | "yes" | "no"
};

export type ChatTurn = { who: "patient" | "assistant"; text: string };

export type ExtractResult = {
  isMedical: boolean; // false → greeting/chit-chat; use reply, write nothing
  reply: string; // conversational answer when !isMedical
  extracted: ExtractedIntake;
  followUp: string; // ONE gap-filling question, "" when essentials covered
  engine: string; // "AI · model" | "local · model" | "naive-parser" | "intake-guard"
  aiUsed: boolean;
};

const SYSTEM =
  "You are the intake assistant at an Indian government hospital OPD kiosk. " +
  "You converse with a patient in short, simple sentences (they may be elderly, " +
  "in pain, or not highly literate). The patient's messages may be in English, " +
  "transliterated chat, or native-script Indian language (Hindi, Kannada, Tamil, " +
  "Telugu, Bengali, Marathi…). Your job, from the WHOLE conversation so far: " +
  "(1) Decide if the patient is describing a health problem. Greetings (hi/hello/" +
  "namaste), thanks, or unrelated chat are NOT medical — set isMedical false and " +
  "reply with one short warm line inviting them to describe their problem. " +
  "(2) If medical: extract the structured fields. Use ONLY what the patient " +
  "actually said — never invent, never guess. Write values in simple English " +
  "(transliterate medicine names as spoken). " +
  "(3) If a CRITICAL detail is still unknown — current medicines, allergies, or " +
  "major past illnesses (diabetes, BP, asthma…) — ask exactly ONE short follow-up " +
  "question about the most important missing one (priority: medicines, then " +
  "allergies, then past illness). If the essentials are covered, return an empty " +
  "follow-up. Never ask two questions at once. Return ONLY valid JSON, no markdown.";

function transcriptPrompt(turns: ChatTurn[]): string {
  if (turns.length === 0) return "— conversation start —";
  return turns.map((t) => `${t.who === "patient" ? "Patient" : "Assistant"}: ${t.text}`).join("\n");
}

function userPrompt(turns: ChatTurn[]): string {
  return `CONVERSATION SO FAR:
${transcriptPrompt(turns)}

Extract from the WHOLE conversation into this EXACT JSON shape ("" or [] when truly unknown — never invent):
{
  "isMedical": true if the patient is describing a health problem, false for greetings/chit-chat,
  "reply": "when isMedical is false: one short warm line inviting their health problem, else ''",
  "chiefComplaint": "main problem in <= 12 words",
  "durationText": "e.g. '2 days', 'since last week' (as said)",
  "severity": "pain/severity 1-10 if stated, else ''",
  "medications": ["current medicines with dose if said"],
  "allergies": ["allergies if stated"],
  "pastMedical": "past diseases (diabetes, BP, asthma, surgery…) as said",
  "familyHistory": "family history if said",
  "tobacco": "yes/no if smoking or tobacco mentioned, else ''",
  "followUpQuestion": "ONE short question about the most important UNKNOWN critical detail, or '' if essentials are covered"
}`;
}

type RawExtract = Partial<Record<keyof ExtractedIntake | "isMedical" | "reply" | "followUpQuestion", unknown>>;

function emptyExtracted(): ExtractedIntake {
  return {
    chiefComplaint: "",
    durationText: "",
    severity: "",
    medications: [],
    allergies: [],
    pastMedical: "",
    familyHistory: "",
    tobacco: "",
  };
}

function coerce(raw: RawExtract): { extracted: ExtractedIntake; isMedical: boolean; reply: string; followUp: string } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((s) => s.trim())
      : str(v)
        ? [str(v)]
        : [];
  const sev = str(raw.severity).match(/\d{1,2}/)?.[0] ?? "";
  const tobaccoRaw = str(raw.tobacco).toLowerCase();
  const tobacco = tobaccoRaw === "yes" || tobaccoRaw === "no" ? tobaccoRaw : "";
  return {
    isMedical: typeof raw.isMedical === "boolean" ? raw.isMedical : true,
    reply: str(raw.reply).slice(0, 300),
    followUp: str(raw.followUpQuestion).replace(/\s+/g, " ").slice(0, 200),
    extracted: {
      chiefComplaint: str(raw.chiefComplaint).slice(0, 160),
      durationText: str(raw.durationText).slice(0, 80),
      severity: sev ? String(Math.min(10, Math.max(1, Number(sev)))) : "",
      medications: arr(raw.medications).slice(0, 12),
      allergies: arr(raw.allergies).slice(0, 8),
      pastMedical: str(raw.pastMedical).slice(0, 400),
      familyHistory: str(raw.familyHistory).slice(0, 300),
      tobacco,
    },
  };
}

// ── Greeting / chit-chat guard (deterministic, instant, zero AI) ───────────
// The #1 complaint in our previous evaluation: "Hi" got a case-file dump.
// Never again — a greeting gets a greeting, and an invitation to talk.
const CHITCHAT =
  /^(hi+|hii+|hello+|helo+|hey+|namaste|namaskara|vanakkam|good (morning|afternoon|evening|night)|thanks?|thank you|thx|thnx|ty|ok+|okay|okk+|k+|test(ing)?|checking|hello\?|hi\?|\.+|\?+)[\s!.?]*$/i;

function isChitchat(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  return t.length <= 24 && CHITCHAT.test(t);
}

function chitchatReply(): ExtractResult {
  return {
    isMedical: false,
    reply:
      "Hello! I am the hospital intake assistant. Please tell me what health problem you have — " +
      'for example: "I have fever and headache since 2 days."',
    extracted: emptyExtracted(),
    followUp: "",
    engine: "intake-guard",
    aiUsed: false,
  };
}

// ── AI engines ─────────────────────────────────────────────────────────────
async function viaGroq(turns: ChatTurn[]): Promise<ExtractResult | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  for (const model of [process.env.GROQ_MODEL || "openai/gpt-oss-120b", "llama-3.3-70b-versatile"]) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: userPrompt(turns) },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) continue;
      const c = coerce(JSON.parse(raw) as RawExtract);
      return {
        isMedical: c.isMedical,
        reply: c.reply,
        extracted: c.extracted,
        followUp: c.isMedical ? c.followUp : "",
        engine: `AI · ${model.split("/").pop()}`,
        aiUsed: true,
      };
    } catch {
      /* next model */
    }
  }
  return null;
}

async function viaGemini(turns: ChatTurn[]): Promise<ExtractResult | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${SYSTEM}\n\n${userPrompt(turns)}` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 700 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) return null;
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const c = coerce(JSON.parse(json) as RawExtract);
    return {
      isMedical: c.isMedical,
      reply: c.reply,
      extracted: c.extracted,
      followUp: c.isMedical ? c.followUp : "",
      engine: "AI · gemini-2.0-flash",
      aiUsed: true,
    };
  } catch {
    return null;
  }
}

async function viaOllama(turns: ChatTurn[]): Promise<ExtractResult | null> {
  const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "llama3.1";
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(turns) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { message?: { content?: string } };
    const raw = data.message?.content?.trim();
    if (!raw) return null;
    const c = coerce(JSON.parse(raw) as RawExtract);
    return {
      isMedical: c.isMedical,
      reply: c.reply,
      extracted: c.extracted,
      followUp: c.isMedical ? c.followUp : "",
      engine: `local · ${model}`,
      aiUsed: true,
    };
  } catch {
    return null;
  }
}

// ── Naive parser (no AI): sentence buckets — honest, labelled, never dead ──
export function naiveExtract(text: string): ExtractResult {
  const sentences = text
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const has = (s: string, words: string[]) => words.some((w) => s.toLowerCase().includes(w));

  const med = sentences.filter((s) => has(s, ["tablet", "mg", "medicine", "medication", "dawa", "capsule", "syrup", "injection", "ecosprin", "metformin", "telmisartan", "amoxicillin", "propranolol", "paracetamol", "insulin"]));
  const alg = sentences.filter((s) => has(s, ["allerg", "allergy", "reaction to"]));
  const dur = sentences.find((s) => /\b(since|for)\b/i.test(s) && /\b(day|days|week|weeks|month|months|year|years|hota|raha|din|hafte|mahine|saal)\b/i.test(s)) ?? "";
  const pmh = sentences.filter((s) => has(s, ["diabet", "bp", "blood pressure", "asthma", "sugar", "thyroid", "surgery", "operat", "kidney", "heart", "stroke", "tb", "cancer"]));
  const fam = sentences.filter((s) => has(s, ["father", "mother", "brother", "sister", "family"]));
  const tob = sentences.filter((s) => has(s, ["smok", "cigarette", "tobacco", "beedi", "gutka"]));
  const sevMatch = text.match(/(?:severity|pain)\s*(?:is\s*)?(?:of\s*)?(\d{1,2})\s*(?:\/|out of)?\s*(?:10)?/i);
  const chief = sentences.find((s) => !med.includes(s) && !alg.includes(s)) ?? sentences[0] ?? "";

  return {
    isMedical: sentences.length > 0,
    reply: "",
    extracted: {
      chiefComplaint: chief.slice(0, 160),
      durationText: dur.slice(0, 80),
      severity: sevMatch ? String(Math.min(10, Math.max(1, Number(sevMatch[1])))) : "",
      medications: med.map((s) => s.slice(0, 120)),
      allergies: alg.map((s) => s.slice(0, 120)),
      pastMedical: pmh.join(". ").slice(0, 400),
      familyHistory: fam.join(". ").slice(0, 300),
      tobacco: tob.length > 0 ? "yes" : "",
    },
    followUp: "",
    engine: "naive-parser",
    aiUsed: false,
  };
}

// Naive deterministic follow-up: most important unknown critical detail.
function naiveFollowUp(e: ExtractedIntake): string {
  if (e.medications.length === 0 && !e.pastMedical) return "Do you take any medicines regularly?";
  if (e.allergies.length === 0) return "Are you allergic to any medicine?";
  if (!e.pastMedical) return "Do you have any diseases like diabetes, BP or asthma?";
  return "";
}

/**
 * Chat → structured intake. Multi-turn: the whole conversation is re-read
 * every turn, so answers to follow-ups merge into one file. AI lanes first,
 * honest naive fallback, instant greeting guard.
 */
export async function extractIntake(text: string, history: ChatTurn[] = []): Promise<ExtractResult> {
  const clean = text.trim().slice(0, 4000);
  const priorPatientTurns = history.filter((h) => h.who === "patient").length;

  // Fresh conversation + obvious greeting/test → instant conversational
  // reply, zero AI, nothing written. (Mid-conversation "ok"/"thanks" is
  // judged by the AI with full context instead.)
  if (priorPatientTurns === 0 && isChitchat(clean)) return chitchatReply();

  const turns: ChatTurn[] = [...history, { who: "patient", text: clean }];
  for (const engine of engineOrder("extract")) {
    const result =
      engine === "ollama" ? await viaOllama(turns)
      : engine === "groq" ? await viaGroq(turns)
      : await viaGemini(turns);
    if (result) {
      // Hard cap: never ask more than 3 follow-ups total.
      if (priorPatientTurns >= 3) result.followUp = "";
      return result;
    }
  }

  // Naive fallback — merge every patient turn into one text, honest follow-up.
  const patientText = turns.filter((t) => t.who === "patient").map((t) => t.text).join(". ");
  if (priorPatientTurns > 0 && isChitchat(clean)) {
    return {
      isMedical: false,
      reply: "Please tell me a little more about your health.",
      extracted: emptyExtracted(),
      followUp: "",
      engine: "naive-parser",
      aiUsed: false,
    };
  }
  const naive = naiveExtract(patientText);
  return {
    ...naive,
    followUp: priorPatientTurns >= 3 ? "" : naiveFollowUp(naive.extracted),
  };
}