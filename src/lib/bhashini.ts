// ── Bhashini (Government of India ULCA) language AI ────────────────────────
// TypeScript port of the open-source github.com/dteklavya/bhashini_translator
// flow — no Python needed, pure REST calls from Next.js.
//
// Env vars (Vercel → Settings → Environment Variables):
//   BHASHINI_USER_ID        — your ULCA userId
//   BHASHINI_ULCA_API_KEY   — the API key generated in your ULCA profile
//   BHASHINI_PIPELINE_ID    — optional (default: 64392f96daac500b55c543cd)
//
// Get free keys: https://bhashini.gov.in → sign up → My Profile → Generate API Key

const ULCA_ENDPOINT =
  "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline";

const USER_ID = process.env.BHASHINI_USER_ID ?? "";
const ULCA_KEY = process.env.BHASHINI_ULCA_API_KEY ?? "";
const PIPELINE_ID = process.env.BHASHINI_PIPELINE_ID ?? "64392f96daac500b55c543cd";

export function isBhashiniConfigured(): boolean {
  return Boolean(USER_ID && ULCA_KEY);
}

type TaskType = "translation" | "asr" | "tts";

type TaskConfig = {
  taskType: TaskType;
  config: {
    language: { sourceLanguage: string; targetLanguage?: string };
    gender?: string;
    serviceId?: string;
  };
};

type PipelineInfo = {
  callbackUrl: string;
  inferenceKey: string;
  serviceIds: Partial<Record<TaskType, string>>;
};

/** Step 1 — ask ULCA for the serviceIds + inference endpoint for our tasks. */
async function getPipeline(
  tasks: TaskConfig[],
): Promise<PipelineInfo> {
  const res = await fetch(ULCA_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ulcaApiKey: ULCA_KEY,
      userID: USER_ID,
    },
    body: JSON.stringify({
      pipelineTasks: tasks,
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
    }),
  });
  if (!res.ok) {
    throw new Error(`Bhashini config call failed (${res.status})`);
  }
  const data: any = await res.json();
  const endpoint = data?.pipelineInferenceAPIEndPoint;
  if (!endpoint?.callbackUrl || !endpoint?.inferenceApiKey?.value) {
    throw new Error("Bhashini config response missing inference endpoint");
  }
  const serviceIds: Partial<Record<TaskType, string>> = {};
  for (const block of data?.pipelineResponseConfig ?? []) {
    const sid = block?.config?.[0]?.serviceId;
    if (sid && block?.taskType) serviceIds[block.taskType as TaskType] = sid;
  }
  return {
    callbackUrl: endpoint.callbackUrl,
    inferenceKey: endpoint.inferenceApiKey.value,
    serviceIds,
  };
}

/** Step 2 — run the pipeline with inputData and read the answer. */
async function runPipeline(
  tasks: TaskConfig[],
  inputData: { input?: { source: string }[]; audio?: { audioContent: string }[] },
): Promise<any[]> {
  const info = await getPipeline(tasks);
  const withServiceIds = tasks.map((t) => ({
    ...t,
    config: { ...t.config, serviceId: info.serviceIds[t.taskType] ?? "" },
  }));
  const res = await fetch(info.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: info.inferenceKey,
    },
    body: JSON.stringify({
      pipelineTasks: withServiceIds,
      pipelineRequestConfig: { pipelineId: PIPELINE_ID },
      inputData,
    }),
  });
  if (!res.ok) {
    throw new Error(`Bhashini inference failed (${res.status})`);
  }
  const data: any = await res.json();
  return data?.pipelineResponse ?? [];
}

/** Translate text (e.g. "kn" → "en"). Returns null on any failure. */
export async function bhashiniTranslate(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string | null> {
  try {
    if (!isBhashiniConfigured() || !text.trim()) return null;
    const tasks: TaskConfig[] = [
      {
        taskType: "translation",
        config: { language: { sourceLanguage, targetLanguage } },
      },
    ];
    const out = await runPipeline(tasks, { input: [{ source: text }] });
    return out?.[0]?.output?.[0]?.target ?? null;
  } catch (error) {
    console.error("bhashiniTranslate failed:", error);
    return null;
  }
}

/**
 * Speech → text (+ optional translation).
 * With targetLanguage set, returns the TRANSLATED text; without, the transcript.
 * Returns null on any failure.
 */
export async function bhashiniAsr(
  audioBase64: string,
  sourceLanguage: string,
  targetLanguage?: string,
): Promise<string | null> {
  try {
    if (!isBhashiniConfigured() || !audioBase64) return null;
    const tasks: TaskConfig[] = [
      { taskType: "asr", config: { language: { sourceLanguage } } },
    ];
    if (targetLanguage) {
      tasks.push({
        taskType: "translation",
        config: { language: { sourceLanguage, targetLanguage } },
      });
    }
    const out = await runPipeline(tasks, { audio: [{ audioContent: audioBase64 }] });
    if (targetLanguage) {
      return out?.[1]?.output?.[0]?.target ?? null;
    }
    return out?.[0]?.output?.[0]?.source ?? null;
  } catch (error) {
    console.error("bhashiniAsr failed:", error);
    return null;
  }
}