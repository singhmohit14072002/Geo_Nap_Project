import { HttpError } from "../utils/http-error";
import { buildExtractionPrompt } from "../utils/prompt-builder";

const DEFAULT_OLLAMA_URL = "http://localhost:11434/api/generate";
const DEFAULT_OLLAMA_MODEL = "llama3:8b";
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? "45000");

interface OllamaResponsePayload {
  response?: string;
  error?: string;
}

const getOllamaConfig = () => {
  const apiUrl = (process.env.OLLAMA_API_URL ?? DEFAULT_OLLAMA_URL).trim();
  const model = (process.env.OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL).trim();
  return {
    apiUrl,
    model
  };
};

export const callLlamaFallbackForExtraction = async (
  normalizedInput: Record<string, unknown>
): Promise<string> => {
  const { apiUrl, model } = getOllamaConfig();
  const prompt = buildExtractionPrompt(normalizedInput);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OLLAMA_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json"
      }),
      signal: controller.signal
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network error";
    throw new HttpError(502, `Llama fallback request failed: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new HttpError(
      response.status,
      `Llama fallback API failed: ${body.slice(0, 400)}`
    );
  }

  let payload: OllamaResponsePayload;
  try {
    payload = (await response.json()) as OllamaResponsePayload;
  } catch {
    throw new HttpError(502, "Llama fallback returned non-JSON response");
  }

  if (payload.error) {
    throw new HttpError(502, `Llama fallback error: ${payload.error}`);
  }

  const content = (payload.response ?? "").trim();
  if (!content) {
    throw new HttpError(502, "Llama fallback returned empty response content");
  }

  return content;
};
