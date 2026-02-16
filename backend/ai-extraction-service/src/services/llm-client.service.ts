import { z } from "zod";
import { HttpError } from "../utils/http-error";

export type LlmProvider = "openai" | "perplexity";

interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
}

interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const PERPLEXITY_API_URL =
  process.env.PERPLEXITY_API_URL ?? "https://api.perplexity.ai/chat/completions";

const openAIResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(
              z.object({
                type: z.string().optional(),
                text: z.string().optional()
              })
            )
          ])
        })
      })
    )
    .min(1)
});

const getPerplexityKey = (): string => {
  const primary = (process.env.PERPLEXITY_API_KEY ?? "").trim();
  if (primary) {
    return primary;
  }
  const alias1 = (process.env.PPLX_API_KEY ?? "").trim();
  if (alias1) {
    return alias1;
  }
  const alias2 = (process.env.PERPLEXITY_KEY ?? "").trim();
  if (alias2) {
    return alias2;
  }
  return "";
};

const resolveProvider = (): LlmProvider => {
  const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "openai" || explicit === "perplexity") {
    return explicit;
  }

  const openAiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  const perplexityKey = getPerplexityKey();
  if (openAiKey) {
    return "openai";
  }
  if (perplexityKey) {
    return "perplexity";
  }

  return "openai";
};

const getLlmConfig = (): LlmConfig => {
  const provider = resolveProvider();

  if (provider === "openai") {
    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new HttpError(
        500,
        "No LLM API key configured. Set OPENAI_API_KEY or switch LLM_PROVIDER to perplexity and set PERPLEXITY_API_KEY."
      );
    }
    return {
      provider,
      apiKey,
      apiUrl: OPENAI_API_URL,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    };
  }

  const apiKey = getPerplexityKey();
  if (!apiKey) {
    throw new HttpError(
      500,
      "Perplexity API key is not configured for LLM_PROVIDER=perplexity. Set PERPLEXITY_API_KEY (or PPLX_API_KEY)."
    );
  }
  return {
    provider,
    apiKey,
    apiUrl: PERPLEXITY_API_URL,
    model: process.env.PERPLEXITY_MODEL ?? "sonar-pro"
  };
};

const contentToString = (
  content: string | Array<{ type?: string; text?: string }>
): string => {
  if (typeof content === "string") {
    return content;
  }
  return content
    .map((part) => part.text ?? "")
    .join("")
    .trim();
};

export const callLlm = async (
  messages: LlmMessage[],
  expectJsonObject: boolean
): Promise<string> => {
  const config = getLlmConfig();

  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    messages
  };

  if (expectJsonObject && config.provider === "openai") {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new HttpError(
      response.status,
      `${config.provider} API request failed: ${errBody.slice(0, 400)}`
    );
  }

  const payload = await response.json();
  const parsed = openAIResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(
      502,
      `Unexpected ${config.provider} response format`,
      parsed.error.flatten()
    );
  }

  const content = contentToString(parsed.data.choices[0].message.content);
  if (!content) {
    throw new HttpError(502, `${config.provider} response content is empty`);
  }
  return content;
};
