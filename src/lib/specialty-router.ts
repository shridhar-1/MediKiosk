// ── Specialty router: symptoms → the right OPD department ──────────────────
// Patients at a large government hospital campus rarely know which
// department their problem belongs to — they pick "General Medicine" blind.
// The router reads the case text (any of 7 languages, native script or
// transliterated) and suggests the right specialty. DETERMINISTIC rules —
// routing is code, not prompts. Priority-ordered: the highest-stakes
// specialty matches first, so "chest pain and knee pain" routes to
// Cardiology. A red flag (e.g. RF-ACS-01) always overrides routing —
// emergency goes to triage regardless of department.

import type { DepartmentId } from "@/lib/types";

const RULES: { dept: DepartmentId; re: RegExp }[] = [
  {
    dept: "cardiology",
    re: /chest\s*(pain|pressure|tightness)|palpitation|heart\s*(attack|pain|problem)|angina|हृदय|दिल|छाती\s*में\s*दर्द|सीने\s*में|ಎದೆ\s*ನೋವು|ಎದೆ\s*ಭಾರ|ಹೃದಯ|மார்பு\s*வலி|இதய|గుండె|ఆంజైనా|বুকে\s*ব্যথা|বুক\s*জ্বালা|हृदयरोग|छातीत\s*दुखणे/i,
  },
  {
    dept: "obgyn",
    re: /pregnan|periods?\b|menstru|vaginal|menopause|delivery|गर्भवती|मासिक|पीरियड|गर्भ|ಗರ್ಭಿಣಿ|ಅವಧಿ\s*ಧರ್ಮ|மாதவிடாய்|கர்ப்|గర్భవతి|పీరియడ్|বমি? না|গর্ভবতী|মাসিক|गर्भवती|मासिक\s*धर्म/i,
  },
  {
    dept: "pediatrics",
    re: /my\s*(child|baby|son|daughter)|infant|newborn|\bchild\b|बच्चा|बेटा|बेटी|ಮಗು|ಮಗ\b|ಮಗಳ|குழந்தை|மகன்|மகள்|పిల్లవాడు|కొడుకు|కూతురు|শিশু|বাচ্চা|मूल|बाळ/i,
  },
  {
    dept: "pulmonology",
    re: /cough|sputum|wheez|asthma|tubercul|\btb\b|breathless|shortness\s*of\s*breath|खांसी|सांस|दम\b|ಕೆಮ್ಮು|ಉಸಿರು|ಆಸ್ಮ|இருமல்|மூச்சு|దగ్గు|ఆయాస|কাশি|শ্বাস|দম|खोकला|धाप\s*लागणे/i,
  },
  {
    dept: "ent",
    re: /\bear\b|\bnose\b|throat|sinus|tonsil|hearing|nasal|कान|नाक|गला|गले|ಕಿವಿ|ಮೂಗು|ಗಂಟಲು|காது|மூக்கு|தொண்டை|చెవి|ముక్కు|గొంతు|কান|নাক|গলা/i,
  },
  {
    dept: "dermatology",
    re: /skin|rash|itch|acne|eczema|fungal|psoriasis|hair\s*fall|hairfall|त्वचा|खुजली|चकत्ते|फोड़|खाज|ಚರ್ಮ|ಕಜಬು|ಗುಳಿ\s*ಇಳಿ|தோல்|அரிப்பு|படை|చర్మం|దురద|బొబ్బలు|ত্বক|চুলকানি|র‍্যাশ/i,
  },
  {
    dept: "gastroenterology",
    re: /stomach|abdomen|gastrit|acidity|acid\s*reflux|jaundice|liver|piles|constipat|loose\s*motion|diarrh|vomit|nausea|पेट|लिवर|पाइल्स|कब्ज|दस्त|मतली|उल्टी|जन्डिस|ಹೊಟ್ಟೆ|ವಾಂತಿ|ಅತಿಸಾರ|வயிறு|குடல்|வாந்தி|மஞ்சள்|కడుపు|వాంతు|జాండిస్|পেট|বমি|জন্ডিস|পাতা঳|पोट\s*दुखणे/i,
  },
  {
    dept: "orthopedics",
    re: /joint|\bknee\b|back\s*(pain|ache)|backache|bone|fracture|sprain|shoulder\s*pain|neck\s*pain|जोड़|घुटना|कमर\s*दर्द|हड्डी|टूट|सांधा|गुडघा|ಮೂಳೆ|ಸಂಧಿ|ಮೊಣಕಾಲು|ಬೆನ್ನು|எலும்பு|முழங்கால்|முதுகு\s*வலி|ఎముక|మోకాలు|నడుము|হাঁটু|হাড়|জয়েন্ট|কোমর/i,
  },
  {
    dept: "surgery",
    re: /lump|hernia|appendicitis|breast\s*(lump|pain)|swelling|wound\s*not\s*heal|cyst|गांठ|सूजन|ಗಡ್ಡೆ|ಊತ|கட்டி|வீக்கம்|గడ్ద|వాపు|গাঁট|ফোলা/i,
  },
];

/** Suggest a specialty from case text. null = no clear signal (stay as-is). */
export function suggestDepartment(text: string): DepartmentId | null {
  const t = (text ?? "").trim();
  if (t.length < 12) return null; // too little signal — never guess
  for (const r of RULES) {
    if (r.re.test(t)) return r.dept;
  }
  return null;
}
