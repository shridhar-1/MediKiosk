// ── Chat-Intake extraction: free speech → structured interview answers ────
// MULTI-TURN, CONTEXT-AWARE, MULTILINGUAL: the patient chats freely in any
// of 7 languages. The AI extracts the SAME structured fields the guided
// interview collects, detects what is MISSING, and asks ONE follow-up at a
// time — IN THE PATIENT'S OWN LANGUAGE. Short answers ("no", "ಇಲ್ಲ", "नहीं")
// are interpreted as answers to the previous question, never as chit-chat.
// Every turn re-runs the deterministic safety engines — red flags, drug–drug,
// drug–allergy — so emergencies surface mid-conversation.
//
// Greetings ("hi", "ನಮಸ್ಕಾರ", "namaste") get a warm reply in the patient's
// language — never a fake medical file. No AI reachable → honest naive
// parser with deterministic translated follow-ups.

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
  // set by the naive path when a short answer marked a field as KNOWN
  medicationsKnown?: boolean;
  allergiesKnown?: boolean;
  pmhKnown?: boolean;
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

// ── Patient-facing strings, all 7 languages ────────────────────────────────
const LANG_NAME: Record<string, string> = {
  en: "English", hi: "Hindi", ta: "Tamil", te: "Telugu",
  bn: "Bengali", mr: "Marathi", kn: "Kannada",
};

const GREETING_REPLY: Record<string, string> = {
  en: 'Hello! I am the hospital intake assistant. Please tell me what health problem you have — for example: "I have fever and headache since 2 days."',
  hi: 'नमस्ते! मैं अस्पताल का सहायक हूँ। कृपया बताइए आपको क्या स्वास्थ्य समस्या है — जैसे: "मुझे 2 दिन से बुखार और सिरदर्द है।"',
  kn: 'ನಮಸ್ಕಾರ! ನಾನು ಆಸ್ಪತ್ರೆಯ ಸಹಾಯಕ. ದಯವಿಟ್ಟು ನಿಮಗೆ ಇರುವ ಆರೋಗ್ಯ ಸಮಸ್ಯೆಯನ್ನು ಹೇಳಿ — ಉದಾಹರಣೆಗೆ: "ನನಗೆ 2 ದಿನದಿಂದ ಜ್ವರ ಮತ್ತು ತಲೆನೋವು ಇದೆ."',
  ta: 'வணக்கம்! நான் மருத்துவமனை உதவியாளர். உங்களுக்கு என்ன உடல்நலப் பிரச்சனை என்று சொல்லுங்கள் — உதாரணமாக: "எனக்கு 2 நாட்களாக காய்ச்சலும் தலைவலியும் உள்ளது."',
  te: 'నమస్కారం! నేను ఆసుపత్రి సహాయకుడు. మీకు ఉన్న ఆరోగ్య సమస్య చెప్పండి — ఉదాహరణకు: "నాకు 2 రోజులుగా జ్వరం, తలనొప్పి ఉన్నాయి."',
  bn: 'নমস্কার! আমি হাসপাতালের সহায়ক। আপনার কী স্বাস্থ্য সমস্যা তা বলুন — যেমন: "আমার ২ দিন ধরে জ্বর ও মাথাব্যথা।"',
  mr: 'नमस्कार! मी रुग्णालयाचा सहाय्यक आहे. तुम्हाला काय आरोग्य समस्या आहे ते सांगा — उदाहरणार्थ: "मला २ दिवसांपासून ताप व डोकेदुखी आहे."',
};

const MORE_INFO_REPLY: Record<string, string> = {
  en: "Please tell me a little more about your health problem.",
  hi: "कृपया अपनी स्वास्थ्य समस्या के बारे में थोड़ा और बताएं।",
  kn: "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಆರೋಗ್ಯ ಸಮಸ್ಯೆಯ ಬಗ್ಗೆ ಇನ್ನಷ್ಟು ಹೇಳಿ.",
  ta: "உங்கள் உடல்நலப் பிரச்சனை பற்றி இன்னும் கொஞ்சம் சொல்லுங்கள்.",
  te: "మీ ఆరోగ్య సమస్య గురించి ఇంకొంచెం చెప్పండి.",
  bn: "আপনার স্বাস্থ্য সমস্যা সম্পর্কে আরেকটু বলুন।",
  mr: "कृपया तुमच्या आरोग्य समस्येबद्दल अजून थोडे सांगा.",
};
// Answered when the patient asks what the assistant can help with —
// never a repeat of "tell me your problem" (evaluator-tested behaviour).
const CAPABILITY_REPLY: Record<string, string> = {
  en: 'I can help with fever, cough and cold, pain, stomach problems, sugar and BP, skin issues and more. Please tell me what problem you have — for example: "I have fever since 2 days."',
  hi: 'मैं बुखार, खांसी-जुकाम, दर्द, पेट की समस्या, शुगर और बीपी, त्वचा की समस्या आदि में मदद कर सकता हूँ। कृपया अपनी समस्या बताइए — जैसे: "मुझे 2 दिन से बुखार है।"',
  kn: 'ಜ್ವರ, ಕೆಮ್ಮು-ಶೀತ, ನೋವು, ಹೊಟ್ಟೆ ಸಮಸ್ಯೆ, ಸಕ್ಕರೆ ಮತ್ತು ರಕ್ತದೊತ್ತಡ, ಚರ್ಮದ ಸಮಸ್ಯೆಗಳಲ್ಲಿ ನಾನು ಸಹಾಯ ಮಾಡಬಲ್ಲೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಮಸ್ಯೆಯನ್ನು ಹೇಳಿ — ಉದಾಹರಣೆಗೆ: "ನನಗೆ 2 ದಿನದಿಂದ ಜ್ವರ ಇದೆ."',
  ta: 'காய்ச்சல், இருமல்-சளி, வலி, வயிற்று பிரச்சனை, சர்க்கரை மற்றும் ரத்த அழுத்தம், தோல் பிரச்சனைகளில் நான் உதவ முடியும். உங்கள் பிரச்சனையை சொல்லுங்கள் — உதாரணமாக: "எனக்கு 2 நாட்களாக காய்ச்சல்."',
  te: 'జ్వరం, దగ్గు-జలుబు, నొప్పి, కడుపు సమస్యలు, చక్కెర మరియు బిపి, చర్మ సమస్యలలో నేను సహాయం చేయగలను. మీ సమస్య చెప్పండి — ఉదాహరణకు: "నాకు 2 రోజులుగా జ్వరం."',
  bn: 'জ্বর, কাশি-সর্দি, ব্যথা, পেটের সমস্যা, ডায়াবেটিস ও বিপি, চর্মরোগে আমি সাহায্য করতে পারি। আপনার সমস্যা বলুন — যেমন: "আমার ২ দিন ধরে জ্বর।"',
  mr: 'ताप, खोकला-सर्दी, दुखणे, पोटाच्या समस्या, साखर व बीपी, त्वचारोग यांमध्ये मी मदत करू शकतो. तुमची समस्या सांगा — उदाहरणार्थ: "मला २ दिवसांपासून ताप आहे."',
};

const Q_MEDS: Record<string, string> = {
  en: "Do you take any medicines regularly?",
  hi: "क्या आप नियमित रूप से कोई दवा लेते हैं?",
  kn: "ನೀವು ನಿಯಮಿತವಾಗಿ ಯಾವುದೇ ಔಷಧಿಗಳನ್ನು ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರಾ?",
  ta: "நீங்கள் வழக்கமாக எந்த மருந்தையும் எடுக்கிறீர்களா?",
  te: "మీరు క్రమం తప్పకుండా ఏవైనా మందులు వాడుతున్నారా?",
  bn: "আপনি কি নিয়মিত কোনো ওষুধ নেন?",
  mr: "तुम्ही नियमितपणे कोणतीही औषधे घेता का?",
};

const Q_ALLERGY: Record<string, string> = {
  en: "Are you allergic to any medicine?",
  hi: "क्या आपको किसी दवा से एलर्जी है?",
  kn: "ನೀವು ಯಾವುದೇ ಔಷಧಿಗೆ ಅಲರ್ಜಿ ಹೊಂದಿದ್ದೀರಾ?",
  ta: "எந்த மருந்திற்கும் உங்களுக்கு ஒவ்வாமை உள்ளதா?",
  te: "మీకు ఏదైనా మందుకు అలర్జీ ఉందా?",
  bn: "আপনার কি কোনো ওষুধে অ্যালার্জি আছে?",
  mr: "तुम्हाला कोणत्याही औषधीची ऍलर्जी आहे का?",
};

const Q_PMH: Record<string, string> = {
  en: "Do you have any diseases like diabetes, BP or asthma?",
  hi: "क्या आपको मधुमेह, बीपी या अस्थमा जैसी बीमारी है?",
  kn: "ನೀವು ಮಧುಮೇಹ, ರಕ್ತದೊತ್ತಡ ಅಥವಾ ಆಸ್ತಮಾ ದಂತಹ ಕಾಯಿಲೆ ಹೊಂದಿದ್ದೀರಾ?",
  ta: "உங்களுக்கு சர்க்கரை நோய், ரத்த அழுத்தம் அல்லது ஆஸ்துமா போன்ற நோய்கள் உள்ளதா?",
  te: "మీకు డయాబెటిస్, బిపి లేదా ఆస్తమా వంటి వ్యాధులు ఉన్నాయా?",
  bn: "আপনার কি ডায়াবেটিস, বিপি বা হাঁপানির মতো কোনো রোগ আছে?",
  mr: "तुम्हाला मधुमेह, बीपी किंवा दमा यासारखा आजार आहे का?",
};

function pick(map: Record<string, string>, lang: string): string {
  return map[lang] ?? map.en;
}

// ── Prompt ─────────────────────────────────────────────────────────────────
function systemPrompt(lang: string): string {
  const language = LANG_NAME[lang] ?? "English";
  return (
    "You are the intake assistant at an Indian government hospital OPD kiosk. " +
    "You converse with a patient in short, simple sentences (they may be elderly, " +
    "in pain, or not highly literate). The patient speaks " + language + " — their " +
    "messages may be native script or transliterated. " +
    "From the WHOLE conversation so far: " +
    "(1) Decide if the patient is describing a health problem. Greetings, thanks, " +
    "or unrelated chat are NOT medical — set isMedical false and reply with one " +
        "short warm line in " + language + " inviting them to describe their problem. " +
    "If the patient asks what you can help with ('which problems', 'what can you " +
    "do'), answer honestly in one short line — fever, cough/cold, pain, stomach " +
    "problems, sugar/BP, skin issues — then invite them to describe theirs. " +
    "Never repeat your previous reply word-for-word — vary the wording. " +
    "(2) A SHORT ANSWER to your previous question (yes / no / none, in any " +
    "language: ಹೌದು / ಇಲ್ಲ / हाँ / नहीं / ஆம் / இல்லை) IS part of the medical " +
    "conversation — interpret it as the answer to exactly that question. 'No' " +
    "after the medicines question means NO medicines: leave medications empty " +
    "and treat it as KNOWN-none. Never re-ask a question that was already answered. " +
    "(3) If medical: extract the structured fields from the whole conversation. " +
    "Use ONLY what the patient actually said — never invent, never guess. Write " +
    "the field VALUES in simple English (transliterate medicine names as spoken). " +
    "(4) If a CRITICAL detail is still unknown — current medicines, allergies, or " +
    "major past illnesses (diabetes, BP, asthma…) — ask exactly ONE short follow-up " +
    "question in " + language + " about the most important missing one (priority: " +
    "medicines, then allergies, then past illness). Never ask two questions at once. " +
    "Return ONLY valid JSON, no markdown."
  );
}

function transcriptPrompt(turns: ChatTurn[]): string {
  if (turns.length === 0) return "— conversation start —";
  return turns.map((t) => `${t.who === "patient" ? "Patient" : "Assistant"}: ${t.text}`).join("\n");
}

function userPrompt(turns: ChatTurn[]): string {
  return `CONVERSATION SO FAR:
${transcriptPrompt(turns)}

Extract from the WHOLE conversation into this EXACT JSON shape ("" or [] when truly unknown — never invent):
{
  "isMedical": true if the patient is describing a health problem or answering your question, false for greetings/chit-chat,
  "reply": "when isMedical is false: one short warm line in the patient's language, else ''",
  "chiefComplaint": "main problem in <= 12 words (simple English)",
  "durationText": "e.g. '2 days', '13 days' (simple English)",
  "severity": "pain/severity 1-10 if stated, else ''",
  "medications": ["current medicines with dose if said"],
  "allergies": ["allergies if stated"],
  "pastMedical": "past diseases (diabetes, BP, asthma, surgery…) as said, simple English",
  "familyHistory": "family history if said, simple English",
  "tobacco": "yes/no if smoking or tobacco mentioned, else ''",
  "followUpQuestion": "ONE short question in the patient's language about the most important UNKNOWN critical detail, or '' if essentials are covered",
  "essentialsCovered": true when medicines, allergies AND past illnesses are all KNOWN (even if 'none'), else false
}`;
}

type RawExtract = Partial<
  Record<keyof ExtractedIntake | "isMedical" | "reply" | "followUpQuestion" | "essentialsCovered", unknown>
>;

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

function coerce(raw: RawExtract): {
  extracted: ExtractedIntake; isMedical: boolean; reply: string; followUp: string; essentialsCovered: boolean;
} {
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
    essentialsCovered: raw.essentialsCovered === true,
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
// A greeting gets a greeting — never a fake medical file.
const CHITCHAT =
  /^(hi+|hii+|hello+|helo+|hey+|namaste|namaskara|vanakkam|ನಮಸ್ಕಾರ|ನಮಸ್ತೆ|ಧನ್ಯವಾದ|नमस्ते|नमस्कार|धन्यवाद|शुक्रिया|வணக்கம்|நன்றி|నమస్కారం|ధన్యవాదాలు|নমস্কার|ধন্যবাদ|good (morning|afternoon|evening|night)|thanks?|thank you|thx|thnx|ty|ok+|okay|okk+|k+|test(ing)?|checking|hello\?|hi\?|\.+|\?+)[\s!.?]*$/i;

function isChitchat(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return true;
  return t.length <= 24 && CHITCHAT.test(t);
}
// "Which type problems?" / "what can you do?" — a question ABOUT the
// assistant. Gets a real answer (what we help with), never a repetitive
// "tell me your problem". Only for short questions WITHOUT symptom words —
// "what type of disease I have, I have fever" is a symptom message.
const CAPABILITY_RE =
  /(which|what)\s+(type|kind|sort)s?\s+(of\s+)?(problem|issue|disease|illness|sickness)|what\s+can\s+you\s+(do|help)|what\s+do\s+you\s+(do|treat|handle)|which\s+(problems|diseases)|how\s+(do|does)\s+(you|this|it)\s+work|who\s+are\s+you|what\s+is\s+this|ಯಾವ\s+ರೀತಿಯ|ಸಹಾಯ\s+ಮಾಡು|ನೀವು\s+ಯಾವುದನ್ನು|किस\s+(तरह|प्रकार)\s+की|क्या\s+मदद|मदद\s+कर\s+सकते|क्या\s+कर\s+सकते|என்ன\s+உதவி|என்ன\s+செய்ய|ఏమి\s+సహాయం|మీరు\s+ఏమి|কী\s+সাহায্য|কি\s+করতে\s+পার/i;
const SYMPTOM_WORDS =
  /fever|pain|ache|cough|cold|headache|vomit|loose|sugar|bp|blood pressure|since|dizzy|weak|rash|swell|breath|chest|stomach|ज्वर|बुखार|दर्द|खांसी|पेट|ಜ್ವರ|ನೋವು|ಕೆಮ್ಮು|ಹೊಟ್ಟೆ|காய்ச்சல்|வலி|జ్వరం|నొప్పి|জ্বর|ব্যথা|তাপ/i;

function isCapabilityQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 80) return false;
  if (SYMPTOM_WORDS.test(t)) return false;
  return CAPABILITY_RE.test(t);
}

// Bare yes / no in any supported language — an ANSWER, never chit-chat.
const BARE_YES =
  /^(yes|yeah|yep|ಹೌದು|हाँ|हां|ஆம்|అవును|হ্যাঁ|हो)[\s.!]*$/i;
const BARE_NO =
  /^(no|nope|none|ಇಲ್ಲ|ಇಲ್ಲಾ|नहीं|ना|இல்லை|இல்ல|లేదు|না|नाही)[\s.!]*$/i;

// ── AI engines ─────────────────────────────────────────────────────────────
async function viaGroq(turns: ChatTurn[], lang: string): Promise<ExtractResult | null> {
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
            { role: "system", content: systemPrompt(lang) },
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
        followUp: c.isMedical && !c.essentialsCovered ? c.followUp : "",
        engine: `AI · ${model.split("/").pop()}`,
        aiUsed: true,
      };
    } catch {
      /* next model */
    }
  }
  return null;
}

async function viaGemini(turns: ChatTurn[], lang: string): Promise<ExtractResult | null> {
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
          contents: [{ parts: [{ text: `${systemPrompt(lang)}\n\n${userPrompt(turns)}` }] }],
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
      followUp: c.isMedical && !c.essentialsCovered ? c.followUp : "",
      engine: "AI · gemini-2.0-flash",
      aiUsed: true,
    };
  } catch {
    return null;
  }
}

async function viaOllama(turns: ChatTurn[], lang: string): Promise<ExtractResult | null> {
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
          { role: "system", content: systemPrompt(lang) },
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
      followUp: c.isMedical && !c.essentialsCovered ? c.followUp : "",
      engine: `local · ${model}`,
      aiUsed: true,
    };
  } catch {
    return null;
  }
}

// ── Naive parser (no AI): sentence buckets — honest, labelled, never dead ──
// Understands English + common Hindi/Kannada medical words.
export function naiveExtract(text: string): ExtractResult {
  const sentences = text
    .split(/[.!?;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const has = (s: string, words: string[]) => words.some((w) => s.toLowerCase().includes(w));

  const med = sentences.filter((s) =>
    has(s, ["tablet", "mg", "medicine", "medication", "dawa", "capsule", "syrup", "injection",
      "ecosprin", "metformin", "telmisartan", "amoxicillin", "propranolol", "paracetamol", "insulin",
      "ಮಾತ್ರೆ", "ಔಷಧ", "दवा", "गोली"]),
  );
  const alg = sentences.filter((s) => has(s, ["allerg", "allergy", "reaction to", "ಅಲರ್ಜಿ", "एलर्जी"]));
  const durUnits = /(day|week|month|year|din|dino|hafte|mahine|saal|दिन|हफ्ते|महीने|साल|ದಿನ|ವಾರ|ತಿಂಗಳ|ವರ್ಷ)/i;
  const durSince = /(\bsince\b|\bfor\b|से|ದಿಂದ|ಆಗಿ|இருந்து|నుండి|থেকে|पासून)/i;
  const dur = sentences.find((s) => durSince.test(s) && durUnits.test(s)) ?? "";
  const pmh = sentences.filter((s) =>
    has(s, ["diabet", "bp", "blood pressure", "asthma", "sugar", "thyroid", "surgery", "operat",
      "kidney", "heart", "stroke", "tb", "cancer",
      "ಮಧುಮೇಹ", "ಸಕ್ಕರೆ", "ರಕ್ತದೊತ್ತಡ", "ಆಸ್ತಮಾ", "ಕಾಯಿದೆ", "ಹೃದಯ", "ಮೂತ್ರಪಿಂಡ", "ಶಸ್ತ್ರಚಿಕಿತ್ಸೆ",
      "मधुमेह", "शुगर", "बीपी", "अस्थमा", "दिल", "सर्जरी", "किडनी"]),
  );
  const fam = sentences.filter((s) => has(s, ["father", "mother", "brother", "sister", "family", "ಅಪ್ಪ", "ಅಮ್ಮ", "पिता", "माता"]));
  const tob = sentences.filter((s) =>
    has(s, ["smok", "cigarette", "tobacco", "beedi", "gutka", "ಧೂಮಪಾನ", "ಸಿಗರೇಟ್", "धूमपान", "बीड़ी", "सिगरेट"]),
  );
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

// Naive deterministic follow-up (translated): most important unknown.
function naiveFollowUp(e: ExtractedIntake, lang: string): string {
  if (!e.medicationsKnown && e.medications.length === 0) return pick(Q_MEDS, lang);
  if (!e.allergiesKnown && e.allergies.length === 0) return pick(Q_ALLERGY, lang);
  if (!e.pmhKnown && !e.pastMedical) return pick(Q_PMH, lang);
  return "";
}

/** Which question was the assistant's last message? (for short answers) */
function matchLastQuestion(lastAssistant: string, lang: string): "meds" | "allergy" | "pmh" | null {
  if (!lastAssistant) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  if (norm(lastAssistant) === norm(pick(Q_MEDS, lang))) return "meds";
  if (norm(lastAssistant) === norm(pick(Q_ALLERGY, lang))) return "allergy";
  if (norm(lastAssistant) === norm(pick(Q_PMH, lang))) return "pmh";
  return null;
}

/** Which essential topic does a question mention? (paraphrase-tolerant) */
function questionTopic(text: string): "meds" | "allergy" | "pmh" | null {
  const t = text.toLowerCase();
  if (/allerg|एलर्ज|ಅಲರ್ಜ|ஒவ்வா|అలర్జ|অ্যালার্জ/.test(t)) return "allergy";
  if (/medicin|medication|tablet|drug|दवा|औषध|ಔಷಧ|மருந்த|మందు|ওষুধ|মেডিসিন/.test(t)) return "meds";
  if (/disease|diabet|blood pressure|\bbp\b|asthma|बीमार|रोग|ಕಾಯಿಲೆ|நோய|వ్యాధి|রোগ|অসুস্থ/.test(t)) return "pmh";
  return null;
}

/**
 * Reconstruct KNOWN state from the WHOLE history: every essential question
 * that already got a short yes/no answer is answered — never re-ask it.
 * Used by BOTH the AI path and the naive fallback (LLM-proof).
 */
function markKnownFromHistory(turns: ChatTurn[], lang: string, e: ExtractedIntake): void {
  let pending: "meds" | "allergy" | "pmh" | null = null;
  for (const t of turns) {
    if (t.who === "assistant") {
      pending = matchLastQuestion(t.text, lang) ?? questionTopic(t.text);
    } else if (pending && (BARE_YES.test(t.text) || BARE_NO.test(t.text))) {
      if (BARE_NO.test(t.text)) {
        if (pending === "meds") { e.medications = []; e.medicationsKnown = true; }
        if (pending === "allergy") { e.allergies = []; e.allergiesKnown = true; }
        if (pending === "pmh" && !e.pastMedical) { e.pastMedical = "None reported"; e.pmhKnown = true; }
      } else {
        if (pending === "meds" && e.medications.length === 0) { e.medications = ["Names not stated yet"]; e.medicationsKnown = true; }
        if (pending === "allergy" && e.allergies.length === 0) { e.allergies = ["Not stated yet"]; e.allergiesKnown = true; }
        if (pending === "pmh" && !e.pastMedical) { e.pastMedical = "Yes — details not stated"; e.pmhKnown = true; }
      }
      pending = null;
    } else if (t.who === "patient") {
      pending = null;
    }
  }
}

/**
 * Chat → structured intake. Multi-turn: the whole conversation is re-read
 * every turn, so answers to follow-ups merge into one file. AI lanes first,
 * honest naive fallback, instant greeting guard. `lang` is the kiosk's
 * selected language — replies and follow-ups are written in it.
 */
export async function extractIntake(text: string, history: ChatTurn[] = [], lang = "en"): Promise<ExtractResult> {
  const clean = text.trim().slice(0, 4000);
  const priorPatientTurns = history.filter((h) => h.who === "patient").length;
  const lastAssistant = [...history].reverse().find((t) => t.who === "assistant")?.text ?? "";

  // Fresh conversation + obvious greeting/test → instant warm reply in the
  // patient's language, zero AI, nothing written.
  if (priorPatientTurns === 0 && isChitchat(clean)) {
    return {
      isMedical: false,
      reply: pick(GREETING_REPLY, lang),
      extracted: emptyExtracted(),
      followUp: "",
      engine: "intake-guard",
      aiUsed: false,
    };
  }
    // "Which type problems can you help with?" → a real, helpful answer —
  // never a repeat of "tell me your problem".
  if (isCapabilityQuestion(clean)) {
    return {
      isMedical: false,
      reply: pick(CAPABILITY_REPLY, lang),
      extracted: emptyExtracted(),
      followUp: "",
      engine: "intake-guard",
      aiUsed: false,
    };
  }

  const turns: ChatTurn[] = [...history, { who: "patient", text: clean }];
  for (const engine of engineOrder("extract")) {
    const result =
      engine === "ollama" ? await viaOllama(turns, lang)
      : engine === "groq" ? await viaGroq(turns, lang)
      : await viaGemini(turns, lang);
    if (result) {
      // Short vernacular answers are NEVER chit-chat — they answer the last
      // question. (Belt-and-braces on top of the prompt.)
      if (!result.isMedical && (BARE_YES.test(clean) || BARE_NO.test(clean)) && lastAssistant) {
        result.isMedical = true;
        result.reply = "";
      }
      // Never re-ask the same question back-to-back.
      if (result.followUp && result.followUp.trim().toLowerCase() === lastAssistant.trim().toLowerCase()) {
        result.followUp = "";
      }
      // Deterministic never-re-ask (LLM-proof): a question the conversation
      // already answered with a short yes/no is KNOWN — even if the model
      // re-asks it in different words. Swap it for the next unknown essential.
      markKnownFromHistory(turns, lang, result.extracted);
      if (result.followUp) {
        const asked = matchLastQuestion(result.followUp, lang) ?? questionTopic(result.followUp);
        const known =
          asked === "meds" ? result.extracted.medicationsKnown
          : asked === "allergy" ? result.extracted.allergiesKnown
          : asked === "pmh" ? result.extracted.pmhKnown
          : false;
        if (known) result.followUp = naiveFollowUp(result.extracted, lang);
      }
      // Hard cap: never ask more than 3 follow-ups total.
      if (priorPatientTurns >= 3) result.followUp = "";
      return result;
    }
  }

  // ── Naive fallback (no AI reachable) ─────────────────────────────────────
  // Mid-conversation bare chit-chat: ask for more, politely, in-language.
  if (priorPatientTurns > 0 && isChitchat(clean) && !lastAssistant) {
    return {
      isMedical: false,
      reply: pick(MORE_INFO_REPLY, lang),
      extracted: emptyExtracted(),
      followUp: "",
      engine: "naive-parser",
      aiUsed: false,
    };
  }

  const patientText = turns.filter((t) => t.who === "patient").map((t) => t.text).join(". ");
  const naive = naiveExtract(patientText);
  const e = naive.extracted;

  // Reconstruct KNOWN state from the WHOLE history (shared with the AI path).
  markKnownFromHistory(turns, lang, e);

  return {
    ...naive,
    extracted: e,
    followUp: priorPatientTurns >= 3 ? "" : naiveFollowUp(e, lang),
  };
}