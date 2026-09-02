// ── Utterance Guard — intent understanding BEFORE the LLM sees anything ────
// Deterministic, explainable, no API — "Hi" can never become clinical text.

export type UtteranceIntent = "greeting" | "systemQuestion" | "chitChat" | "tooShort" | "medical";
export type UtteranceCheck = { intent: UtteranceIntent; relevant: boolean; hint?: string };

const GREETINGS =
  /^(hi+|hii+|hello+|hey+|namaste|namaskara|namaskaram|नमस्ते|नमस्कार|ನಮಸ್ಕಾರ|ಹಾಯ್|हाय|good (morning|afternoon|evening)|vanakkam)[\s!.,]*$/i;

const SYSTEM_Q =
  /(what is this|who are you|how does this (work|kiosk)|how many (patients|people|cases)|kya hai|ye kya|ಏನಿದು|ಎಷ್ಟು ಜನ|what should i (say|do))/i;

const MEDICAL_WORDS = new Set([
  "fever","cough","cold","headache","pain","ache","vomiting","vomit","nausea","loose","motion",
  "breath","breathing","chest","throat","back","stomach","abdomen","dizzy","dizziness","weak",
  "weakness","tired","fatigue","sleep","rash","itch","itching","swelling","swollen","bleeding",
  "blood","sugar","pressure","bp","diabetes","asthma","injury","fall","fell","burn","fracture",
  "tooth","ear","eye","nose","skin","joint","knee","legs","hands","body","weight","appetite",
  "thirst","urine","constipation","gas","acidity","burning","numb","tingling","palpitation",
  "anxiety","mood","smoking","alcohol","tablet","medicine","medicines","dose","allergy",
  "allergic","surgery","operation","hospital","doctor","days","day","week","weeks","month",
  "months","year","years","since","morning","night","yesterday","worse","better","severe",
  "mild","suddenly",
  "bukhar","bukhaar","बुखार","khansi","खांसी","जुकाम","sardi","सर्दी","dard","दर्द","पेट",
  "ulti","उल्टी","दस्त","dast","khoon","खून","saans","सांस","kamzori","कमजोरी","नींद","neend",
  "dawai","दवाई","दवा","शुगर",
  "jwara","ಜ್ವರ","ಕೆಮ್ಮು","kemmu","shwasa","ಉಸಿರು","usiru","ನೋವು","novu","ವಾಂತಿ","vaanti",
  "ಅಸ್ವಸ್ಥ","aswastha","ಔಷಧಿ","aushadhi","ಆಸ್ಪತ್ರೆ","ದಿನ","dingalu",
].map((w) => w.toLowerCase()));

const CHAT_WORDS =
  /(weather|cricket|movie|film|song|politics|election|joke|funny|love|thank(s)? you|thanks|ok(ay)?|hmm+|nice|good bye|bye|see you)/i;

export function classifyUtterance(raw: string): UtteranceCheck {
  const compact = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!compact) return { intent: "tooShort", relevant: false, hint: "Please tell us about your health problem." };

  if (GREETINGS.test(compact.toLowerCase()))
    return { intent: "greeting", relevant: false, hint: "Namaste! Please describe your health problem — for example: fever, cough, pain." };

  if (SYSTEM_Q.test(compact))
    return { intent: "systemQuestion", relevant: false, hint: "This kiosk records your health story. Please describe your symptoms — e.g. \"fever since 2 days\"." };

  const words = compact.toLowerCase().split(/[^a-z\u0900-\u097F\u0980-\u09FF\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF]+/).filter(Boolean);
  const hasMedical = words.some((w) => MEDICAL_WORDS.has(w)) ||
    [...MEDICAL_WORDS].some((m) => m.length > 3 && compact.toLowerCase().includes(m));
  if (hasMedical) return { intent: "medical", relevant: true };

  if (CHAT_WORDS.test(compact) || words.length <= 2)
    return {
      intent: words.length <= 2 ? "tooShort" : "chitChat",
      relevant: false,
      hint: words.length <= 2
        ? "Please tell us a little more — what problem do you have since when?"
        : "That is not about your health. Please describe your symptoms.",
    };

  // Unknown dialect words — accept softly; doctor + template both verify.
  return { intent: "medical", relevant: true };
}