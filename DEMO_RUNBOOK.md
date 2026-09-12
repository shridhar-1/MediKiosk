# MediKiosk — 5-Minute Demo Runbook (SIH Judging)

Everything below is the exact click path, with the exact inputs that trigger
each highlight. Practice it twice and the demo is bulletproof.

---

## 0. Pre-demo checklist (do this the night before)

- [ ] Vercel → Project Settings → Environment Variables:
      `DEMO_MODE = "true"` → **Redeploy** (demo buttons need it)
- [ ] Open `https://medi-kiosk-tau.vercel.app/api/ai-status` → all engines you
      plan to show should be `true` (groq, gemini, bhashini)
- [ ] Reset to a clean state:
      `curl -X POST https://medi-kiosk-tau.vercel.app/api/seed/reset`
      (or run it from the Vercel terminal). Queue is re-seeded with the
      ready-made OPD cases, including one EMERGENCY.
- [ ] Keep the handwritten prescription photo on the laptop desktop
      (Bengali orthopaedic prescription — the 9-medicines vision demo).
- [ ] Laptop: sound ON (kiosk speaks), browser zoom 100%, mic allowed.

## Demo accounts (seeded automatically)

| Role | How to enter | Credentials |
|---|---|---|
| Doctor | `/login/staff` → "⚡ One-click demo — doctor" | `physician@medikiosk.in` / `kiosk@2026` |
| Triage nurse | `/login/staff` | `triage@medikiosk.in` / `triage@2026` |
| AYUSH vaidya | `/login/staff` | `vaidya@medikiosk.in` / `ayush@2026` |
| Patient | kiosk or "⚡ One-click demo — patient" | phone `9999900010` |
| Demo patient with history | kiosk → ABHA `12-3456-7890-1234` | Ramesh Kumar, 58 (Hindi) |

---

## The 5-minute script

### 0:00 — Multilingual intake (PS challenge: vernacular)
1. Open `/kiosk` → language grid is showing. Say: *"Twelve Scheduled languages —
   the patient picks first, everything after this is in their language."*
2. Tap **English** → **Continue** → patient screen. Say: *"ABHA or Aadhaar —
   or register as a new patient. Nothing is shared before consent."*
3. Tap **Continue** (Demo Patient) → consent screen: *"DPDP-style consent,
   read aloud for low-literacy patients."* → **I understand and agree**.

### 1:00 — The EMERGENCY moment (the money shot)
4. Choose a department → **Guided** interview.
5. Q1 "What is troubling you the most today?" → tap **Chest pain**.
6. Follow-ups (SOCRATES): associated symptoms → tap **Sweating**;
   radiation → tap **Going to the left arm**.
7. **RF-ACS-01 fires** → red emergency screen: the patient BYPASSES the queue
   and the triage desk is paged. Say: *"This is deterministic code, not an LLM
   prompt — no AI can talk it out of firing."*

### 2:00 — Fast chat (the AI lane)
8. Back → **Fast chat**. Paste/type:
   > I have fever and cough since 3 days, and I take telmisartan 40 and
   > combiflam every day. I am allergic to sulfa drugs.
9. **Build my file** → the AI extracts conditions, medicines, allergy — then
   the drug-safety rules flag what matters. Every field shows which engine
   produced it (never-invent).

### 3:00 — Doctor console
10. New tab: `/login/staff` → **⚡ One-click demo — doctor**.
11. The queue shows your emergency case ON TOP (red), urgent below, routine
    last — live priority triage. Open the emergency case.
12. Walk the consultation screen: summary before the visit, red-flag card with
    the exact rule and evidence, **doctor edits and confirms** (human-in-the-loop).
13. **Ask this patient's record**: type
    > Any allergies or medication conflicts?
    → grounded answer citing the patient's own fields only.

### 4:00 — Any-paper vision (if judges ask for more)
14. Kiosk → documents → upload the Bengali handwritten prescription photo →
    ~9 seconds → 9 medicines + diagnosis + faithful transcript.
    *"Handwritten, in Bengali — read end-to-end in nine seconds."*

### 4:30 — Patient portal + close
15. `/login/patient` → demo patient → history, documents, timeline — the
    patient owns their record (ABDM alignment).
16. Close on `/api/ai-status`: *"Every lane is real, every engine is labelled —
    and all demo shortcuts are env-gated. In production there are zero
    backdoors into the doctor console."*

---

## Recovery plays (if something breaks live)

| Situation | Play |
|---|---|
| Mic denied / noisy room | Type in Fast chat — same AI lane, zero difference |
| Network slow | Point at the engine label — fallback chain is visible by design: "it degrades, never dies" |
| Judge typed nonsense into the record | `curl -X POST .../api/seed/reset` → fresh demo state in ~2 s |
| Wrong language chosen | **Exit** button (top right) → back to language grid |
| Vision takes >15 s | Free-tier congestion: retry once, or skip — chat intake already proved the point |
| Judge asks "can anyone be a doctor?" | Show `/login/staff` without `DEMO_MODE`: no demo button, staff login only — the gate is in `src/lib/auth.ts` |

## One-liners that land

- "History is 70–80% of the diagnosis — our kiosk collects it before the doctor
  ever calls the token." (PS SIH26047 cites this)
- "Rules are code, not prompts."
- "It degrades, never dies." (AI-lane failover)
- "Never invents — every field shows its engine."
