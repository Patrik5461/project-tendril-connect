// Google Gemini API client (direct — NOT via Lovable AI Gateway).
// Reads GEMINI_API_KEY from server env at call time (never at module scope).

export const GEMINI_MODELS = {
  LITE: "gemini-flash-lite-latest",
  FLASH: "gemini-flash-latest",
  PRO: "gemini-pro-latest",
} as const;

export type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

type GenerateOpts = {
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseJson?: boolean;
  /** disable "thinking" for faster/cheaper output; ignored by non-thinking models */
  disableThinking?: boolean;
  /** Fallback model to try if primary fails with 429/503 */
  fallback?: GeminiModel;
  /** short label used in server logs to distinguish concurrent calls */
  logLabel?: string;
};

export class GeminiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function callOnce(model: GeminiModel, prompt: string, opts: GenerateOpts, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
  if (opts.responseJson) body.generationConfig.responseMimeType = "application/json";
  // thinkingConfig is only accepted by 2.5 Pro / 2.5 Flash Thinking; sending it to
  // gemini-flash-latest returns 400 INVALID_ARGUMENT. Only forward when the model
  // name explicitly opts in.
  if (opts.disableThinking && /2\.5|thinking/i.test(model)) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const promptChars = prompt.length + (opts.system?.length ?? 0);
  const approxTokens = Math.round(promptChars / 4);
  const label = opts.logLabel ?? "gemini";
  const t0 = Date.now();

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  const elapsedMs = Date.now() - t0;
  let json: any;
  try { json = JSON.parse(raw); } catch {
    console.error(`[${label}] ${model} status=${res.status} elapsed=${elapsedMs}ms invalid_response chars=${promptChars} ~tok=${approxTokens}`, raw.slice(0, 300));
    throw new GeminiError(res.status, "invalid_response", raw.slice(0, 200));
  }

  if (!res.ok || json.error) {
    const err = json.error ?? { code: res.status, status: "ERROR", message: raw.slice(0, 200) };
    console.error(`[${label}] ${model} status=${res.status} elapsed=${elapsedMs}ms error=${err.status}/${err.code} chars=${promptChars} ~tok=${approxTokens}`, err.message);
    console.error(`[${label}] SYS(head)="${(opts.system ?? "").slice(0, 200)}" USR(head)="${prompt.slice(0, 400)}" details=${JSON.stringify(err.details ?? err).slice(0, 500)}`);
    throw new GeminiError(err.code ?? res.status, err.status ?? "ERROR", err.message ?? "Gemini error");
  }
  const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("") ?? "";
  const usage = json.usageMetadata ?? {};
  console.log(`[${label}] ${model} ok elapsed=${elapsedMs}ms chars=${promptChars} prompt_tok=${usage.promptTokenCount ?? "?"} out_tok=${usage.candidatesTokenCount ?? "?"} total=${usage.totalTokenCount ?? "?"} out_chars=${text.length}`);
  if (!text) {
    const finish = json.candidates?.[0]?.finishReason;
    throw new GeminiError(500, "empty_output", `Model vrátil prázdnu odpoveď (finishReason=${finish ?? "?"}).`);
  }
  return text;
}

/**
 * Retry on 503 with backoff; fallback model on 429/503 if provided.
 * Never retries on 400/401/403 (they are permanent).
 */
export async function geminiGenerate(model: GeminiModel, prompt: string, opts: GenerateOpts = {}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError(500, "missing_key", "GEMINI_API_KEY nie je nastavený.");

  const attempts: Array<{ model: GeminiModel; delayMs: number }> = [
    { model, delayMs: 0 },
    { model, delayMs: 800 },
    { model, delayMs: 2000 },
  ];
  if (opts.fallback && opts.fallback !== model) attempts.push({ model: opts.fallback, delayMs: 0 });

  let lastErr: GeminiError | null = null;
  for (const a of attempts) {
    if (a.delayMs) await new Promise((r) => setTimeout(r, a.delayMs));
    try {
      return await callOnce(a.model, prompt, opts, apiKey);
    } catch (e) {
      if (!(e instanceof GeminiError)) throw e;
      lastErr = e;
      // permanent errors — don't retry
      if ([400, 401, 403, 404].includes(e.status)) throw e;
      // 429/503 → next attempt / fallback
    }
  }
  throw lastErr ?? new GeminiError(500, "unknown", "Gemini failed");
}

export function geminiUserMessage(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 429) return "Gemini API dosiahlo limit požiadaviek. Skús o chvíľu.";
    if (err.status === 503) return "Model je momentálne preťažený. Skús o chvíľu znova.";
    if (err.status === 401 || err.status === 403) return "Chybný alebo neautorizovaný Gemini API kľúč.";
    if (err.status === 400) return "Chyba požiadavky na Gemini: " + err.message;
    return "Gemini chyba: " + err.message;
  }
  return "Neznáma chyba pri volaní AI.";
}
