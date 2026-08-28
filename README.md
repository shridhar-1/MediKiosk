# 🏥 MediKiosk

**AI-powered self-check-in kiosk for hospitals — patient tells their story once, AI prepares the clinical summary, doctor reviews it, patient sees the doctor's advice in their portal.**

🔗 **Live demo:** https://medi-kiosk-tau.vercel.app

---

## 📘 The Problem

In Indian government hospitals, a patient waits in queue just to give their details — name, age, complaint — again and again, at every counter, on every visit. The doctor then takes the medical history verbally and writes it by hand. The patient forgets the doctor's advice by the time they reach home.

**MediKiosk removes this.** The patient checks in once at a kiosk with just a phone number. AI builds a structured clinical summary before the doctor even sees them. After review, the patient can read the doctor's advice anytime in their own portal.

---

## ✨ Features

### 🖥️ Patient Kiosk (`/kiosk`)
- **Login with just a phone number** — Firebase OTP verification with reCAPTCHA
- **Returning patient recognition** — phone numbers are normalized to the last 10 digits, so `+919876543210`, `919876543210` and `9876543210` all find the *same* patient. No duplicate records, no lost history
- **AI-guided medical interview** — simple question-by-question intake, multilingual (English / Hindi)
- **Step-by-step autosave** — if the network drops mid-intake, the session resumes where it stopped
- **DPDP-style consent** — data-use and audio-explanation consent recorded per session before the interview starts

### 🚨 Emergency Alert Engine
- **Hybrid detection**: deterministic **rule-based red-flag checks run first** (chest pain, heavy bleeding, breathlessness…) — never dependent on the AI — then the AI adds softer signals from the full story
- Every alert is **persisted to the database first**, so it is never lost
- Channels: **Email (SMTP)**, **WhatsApp + SMS (Twilio)**, plus a live console feed on the dashboard
- Any missing channel degrades gracefully to a logged mock — the flow never breaks

### 🧠 AI Clinical Summary
- Powered by **Groq** (`openai/gpt-oss-120b`) — fast and cheap, right for a kiosk
- Automatic fallback chain: Groq → Gemini → Ollama → **rule-based template** — the kiosk never gets stuck without AI
- Structured output: chief complaint, HPI, past medical/surgical history, drugs, allergies, family & personal history, review of systems, investigations
- Bilingual (English / हिंदी) summaries

### 👨‍⚕️ Doctor Dashboard (`/physician`)
- **Live queue** of all intakes with tokens, departments and emergency badges
- **Review workspace**: every AI-generated section is editable before confirming
- **Two separate boxes**:
  - 🟢 **Advice for patient** — visible in the patient portal
  - 🟠 **Physician note** — private, for clinicians only
- **Confirm to HIS/ABHA** — marks the record reviewed and ready for the hospital system
- **View FHIR Bundle** — the full record in FHIR, the international standard for medical data exchange
- Live alerts feed with per-channel delivery status

### 📱 Patient Portal (`/portal`)
- Full visit history — every intake, newest first
- **✅ Doctor reviewed / ⏳ Awaiting review** status on each visit
- **👨‍⚕️ Doctor's review box** — who reviewed it, when, and the doctor's advice in plain words
- ABHA number can be linked to the patient record

---

## 🔁 How It Works

```
┌──────────┐     ┌────────────┐     ┌──────────────┐     ┌────────────┐
│  Patient  │     │   Kiosk    │     │      AI      │     │   Doctor   │
│  walks in │ --> │  phone OTP │ --> │  interview + │ --> │  reviews,  │
│           │     │  no forms  │     │  summary +   │     │  edits,    │
│           │     │            │     │  red flags   │     │  confirms  │
└──────────┘     └────────────┘     └──────────────┘     └────────────┘
                                            │                   │
                                   🚨 emergency alert        confirms +
                                   email/WhatsApp/SMS   writes advice
                                                                │
                     ┌────────────┐                             v
                     │  Patient   │ <-------- advice + full summary in
                     │  portal    │          their portal, forever
                     └────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + TypeScript |
| Styling | Tailwind CSS 4 |
| Database | **PostgreSQL** + **Drizzle ORM** (type-safe schema & queries) |
| Auth | **Firebase** phone OTP (patient) + server session cookies (HttpOnly) |
| AI | **Groq** (`openai/gpt-oss-120b`), fallbacks: Gemini, Ollama, template engine |
| Alerts | **Nodemailer** (SMTP email), **Twilio** (WhatsApp + SMS) |
| Standards | FHIR bundle output, ABHA id storage, DPDP consent records |
| Hosting | **Vercel** (auto-deploy from GitHub) |

---

## 🚀 Getting Started

```bash
# 1. Clone
git clone https://github.com/shridhar-1/MediKiosk.git
cd MediKiosk

# 2. Install dependencies
npm install

# 3. Create .env.local (see table below)

# 4. Create the database tables
npx drizzle-kit push

# 5. Run
npm run dev          # http://localhost:3000
```

---

## 🔑 Environment Variables

Create a `.env.local` file. Only the first two groups are needed to run — everything else degrades gracefully.

**Required**

| Variable | What it does |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_STORAGE_BUCKET` / `_MESSAGING_SENDER_ID` / `_APP_ID` | Firebase phone-auth config |

**AI (all optional — template fallback if unset)**

| Variable | What it does |
|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL` | Primary summary engine |
| `GEMINI_API_KEY` | Fallback engine |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local/self-host fallback |
| `AI_ENGINE` | Force a specific engine |

**Emergency alerts (optional — logged as mock if unset)**

| Variable | What it does |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Email alerts |
| `HOSPITAL_ALERT_EMAIL`, `HOSPITAL_ALERT_PHONE`, `HOSPITAL_ALERT_WHATSAPP` | Where alerts are sent |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | WhatsApp/SMS sending |

**Future integrations (slots ready, onboarding in progress)**

| Variable | What it does |
|---|---|
| `ABDM_CLIENT_ID`, `ABDM_CLIENT_SECRET`, `ABDM_GATEWAY_URL`, `ABDM_X_HIP_ID`, `ABDM_HIP_NAME` | ABDM / ABHA push |
| `NEXT_PUBLIC_BHASHINI_API_KEY`, `NEXT_PUBLIC_BHASHINI_ASR_URL`, `BHASHINI_USER_ID` | Bhashini speech input |
| `HIS_FHIR_URL`, `HIS_FHIR_BASIC_AUTH`, `HIS_API_KEY` | Hospital Information System |
| `UIDAI_LICENSE_KEY`, `UIDAI_VAULT_URL`, `UIDAI_EKYC_URL` | Aadhaar e-KYC |

> ⚠️ After changing variables on Vercel, **redeploy** — changes only take effect on a new deployment.

---

## 📡 Key API Routes

| Route | Purpose |
|---|---|
| `POST /api/auth/demo` | Patient/staff session login (phone normalized to last 10 digits) |
| `GET/POST /api/patients` | Register / search patients (phone & ABHA de-duplicate) |
| `GET/POST/DELETE /api/sessions` | Intake sessions (`?phone=`, `?abhaId=`, `?patientId=`) |
| `POST /api/sessions/[id]/answers` | Save interview answers |
| `POST /api/sessions/[id]/submit` | Submit intake → generate summary + fire alerts |
| `POST/PATCH /api/sessions/[id]/summary` | Generate / edit / confirm summary, save patient advice |
| `GET /api/notifications` | Live alert feed + per-channel status |

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── api/                 # API routes (auth, patients, sessions, summary, notifications)
│   ├── kiosk/               # Patient kiosk intake
│   ├── portal/              # Patient portal (history + doctor's advice)
│   ├── physician/           # Doctor dashboard (queue, records, review)
│   └── login/               # Login pages
├── components/
│   ├── PhoneAuth.tsx        # Phone/OTP login component
│   ├── kiosk-app.tsx        # Intake interview UI
│   └── physician/           # Review workspace, queue, doctor-detail views
├── db/                      # Drizzle schema + client
└── lib/                     # summary-engine, alert engine, auth, ids, seed
```

---

## 🧪 Before You Push

```bash
npm run typecheck    # tsc --noEmit — must print nothing
npm run build        # verify the build passes
```

---

## 🗺️ Roadmap

- 🎙️ **Bhashini** speech input — voice intake in 12+ Indian languages
- 🏛️ Full **ABDM onboarding** — push confirmed records to the patient's ABHA health locker
- 🔢 Live **token display board** so patients know their turn
- 🪪 Aadhaar e-KYC based identity (UIDAI slots prepared)

---

## 🤝 Demo Logins

| Role | How |
|---|---|
| Patient | Any phone number (OTP) — demo mode also allows direct login |
| Doctor / Staff | Any staff email, e.g. `dr.meena@hospital.in` |

---

## 👤 Author

**Shridhar Madival** — built as a hospital-tech project for Indian public healthcare.

🔗 Repo: [shridhar-1/MediKiosk](https://github.com/shridhar-1/MediKiosk) · Live: [medi-kiosk-tau.vercel.app](https://medi-kiosk-tau.vercel.app)

---

## 📄 License

For demonstration and evaluation. All patient data in the demo is synthetic test data.
