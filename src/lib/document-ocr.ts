/**
 * MediKiosk Document OCR - Pluggable Engine
 * 
 * Current: Tesseract.js (client-side, works offline, English + Hindi)
 * Future: Bhashini OCR, Google Cloud Vision, Azure Document Intelligence
 * 
 * This abstraction allows swapping OCR engines without changing UI.
 */

export type OcrResult = {
  text: string;
  confidence: number;
  engine: string;
  language: string;
};

export type OcrEngine = "tesseract" | "bhashini" | "google-vision" | "mock";

// Configuration - change via env
const OCR_ENGINE = (process.env.NEXT_PUBLIC_OCR_ENGINE || "tesseract") as OcrEngine;
const BHASHINI_API_KEY = process.env.NEXT_PUBLIC_BHASHINI_API_KEY;
const BHASHINI_API_URL = process.env.NEXT_PUBLIC_BHASHINI_API_URL || "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";

/**
 * Tesseract.js OCR - Client-side, works offline
 * Supports: English, Hindi, Tamil, Telugu, Bengali, Marathi, Kannada
 */
async function ocrWithTesseract(
  file: File | string,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  // Dynamic import to avoid SSR issues
  const { createWorker } = await import("tesseract.js");

  // Detect language from file name or default to eng+hin
  const lang = "eng+hin+tam+tel+ben+mar+kan"; // Multi-language for Indian docs
  
  const worker = await createWorker(lang, 1, {
    logger: (m: any) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(file);
    await worker.terminate();

    return {
      text: data.text,
      confidence: data.confidence,
      engine: "tesseract",
      language: lang,
    };
  } catch (error) {
    await worker.terminate();
    throw error;
  }
}

/**
 * Bhashini OCR - Government of India AI (Future integration)
 * Docs: https://bhashini.gov.in
 * This is a placeholder - replace with actual Bhashini API call
 */
async function ocrWithBhashini(
  file: File,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  if (!BHASHINI_API_KEY) {
    console.warn("BHASHINI_API_KEY not set, falling back to Tesseract");
    return ocrWithTesseract(file, onProgress);
  }

  onProgress?.(10);
  
  // Convert file to base64
  const base64 = await fileToBase64(file);
  onProgress?.(30);

  // Bhashini API call (example structure - update per actual API)
  const response = await fetch(BHASHINI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": BHASHINI_API_KEY,
    },
    body: JSON.stringify({
      pipelineTasks: [
        {
          taskType: "ocr",
          config: {
            language: { sourceLanguage: "en" },
            serviceId: "bhashini/ocr",
          },
        },
      ],
      inputData: {
        input: [{ source: base64 }],
      },
    }),
  });

  onProgress?.(80);

  if (!response.ok) {
    throw new Error(`Bhashini OCR failed: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.pipelineResponse?.[0]?.output?.[0]?.source || "";

  onProgress?.(100);

  return {
    text,
    confidence: 0.85,
    engine: "bhashini",
    language: "multi",
  };
}

/**
 * Main OCR function - pluggable engine
 */
export async function performOCR(
  file: File,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  const engine = OCR_ENGINE;

  try {
    switch (engine) {
      case "bhashini":
        return await ocrWithBhashini(file, onProgress);
      case "tesseract":
      default:
        return await ocrWithTesseract(file, onProgress);
    }
  } catch (error) {
    console.error(`OCR with ${engine} failed, trying fallback:`, error);
    // Fallback to mock if all fails
    if (engine !== "tesseract") {
      return ocrWithTesseract(file, onProgress);
    }
    throw error;
  }
}

/**
 * Helper: File to base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
  });
}

/**
 * Helper: Validate file type
 */
export function isValidDocumentFile(file: File): boolean {
  const validTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "application/pdf",
    "text/plain",
  ];
  const validExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf", ".txt"];
  
  if (validTypes.includes(file.type)) return true;
  
  const ext = "." + file.name.split(".").pop()?.toLowerCase();
  return validExtensions.includes(ext);
}

/**
 * Helper: Get file type label
 */
export function getFileTypeLabel(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  return "document";
}