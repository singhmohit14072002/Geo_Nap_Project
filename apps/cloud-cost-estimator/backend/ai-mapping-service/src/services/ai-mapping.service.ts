import { z } from "zod";
import {
  mapRequestSchema,
  MapRequest,
  requirementSchemaContract,
  standardizedRequirementSchema,
  StandardizedRequirement
} from "../schemas/requirement.schema";
import { HttpError } from "../utils/http-error";
import logger from "../utils/logger";
import { buildMappingPrompt } from "./prompt-builder";
import { evaluateMappingQuality } from "./confidence.service";

type LlmProvider = "openai" | "perplexity";

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
const MAX_MAPPING_INPUT_CHARS = Number(process.env.MAX_MAPPING_INPUT_CHARS ?? "120000");

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
  return (process.env.OPENAI_API_KEY ?? "").trim() ? "openai" : "perplexity";
};

const getLlmConfig = (): LlmConfig => {
  const provider = resolveProvider();
  if (provider === "openai") {
    const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new HttpError(
        500,
        "OPENAI_API_KEY is not configured for LLM_PROVIDER=openai"
      );
    }
    return {
      provider,
      apiKey,
      apiUrl: OPENAI_API_URL,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini"
    };
  }

  const perplexityKey = getPerplexityKey();
  if (!perplexityKey) {
    throw new HttpError(
      500,
      "PERPLEXITY_API_KEY is not configured for LLM_PROVIDER=perplexity"
    );
  }
  return {
    provider,
    apiKey: perplexityKey,
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
  return content.map((part) => part.text ?? "").join("").trim();
};

const extractJsonBlock = (rawContent: string): string => {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1).trim();
  }

  throw new HttpError(422, "AI mapping response did not contain JSON");
};

const callLlm = async (
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
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "geo_nap_infra_requirement",
        strict: true,
        schema: requirementSchemaContract
      }
    };
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

const enforceSchemaShape = (value: unknown): void => {
  if (!value || typeof value !== "object") {
    throw new HttpError(422, "AI mapping output must be a JSON object");
  }

  const topKeys = Object.keys(value as Record<string, unknown>).sort();
  const requiredTopKeys = ["compute", "database", "network", "region"].sort();
  if (JSON.stringify(topKeys) !== JSON.stringify(requiredTopKeys)) {
    throw new HttpError(422, "AI mapping output top-level schema was modified", {
      expected: requiredTopKeys,
      received: topKeys
    });
  }
};

const trimRawPayload = (input: MapRequest): MapRequest => {
  const serialized = JSON.stringify(input.rawInfrastructureData);
  if (serialized.length <= MAX_MAPPING_INPUT_CHARS) {
    return input;
  }

  throw new HttpError(
    413,
    `rawInfrastructureData is too large for mapping (${serialized.length} chars, max ${MAX_MAPPING_INPUT_CHARS})`
  );
};

export const mapInfrastructure = async (
  payload: unknown
): Promise<{
  requirement: StandardizedRequirement;
  mappingConfidence: number;
  warnings: string[];
}> => {
  const parsed = mapRequestSchema.safeParse(payload);
  if (!parsed.success) {
    throw new HttpError(422, "Map request validation failed", parsed.error.flatten());
  }

  const safeInput = trimRawPayload(parsed.data);
  const prompt = buildMappingPrompt(safeInput);

  logger.info("MAPPING_STARTED", {
    sourceType: safeInput.sourceType
  });

  const content = await callLlm(
    [
      {
        role: "system",
        content:
          "You map structured infrastructure JSON into a fixed schema. Never add schema fields and never estimate cost."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    true
  );

  const jsonBlock = extractJsonBlock(content);
  let mappedObj: unknown;
  try {
    mappedObj = JSON.parse(jsonBlock);
  } catch {
    throw new HttpError(422, "AI mapping returned invalid JSON");
  }

  enforceSchemaShape(mappedObj);

  const validated = standardizedRequirementSchema.safeParse(mappedObj);
  if (!validated.success) {
    logger.warn("MAPPING_SCHEMA_REJECTED", {
      sourceType: safeInput.sourceType
    });
    throw new HttpError(
      422,
      "AI mapping output failed schema validation",
      validated.error.flatten()
    );
  }

  logger.info("MAPPING_SUCCESS", {
    sourceType: safeInput.sourceType
  });

  const quality = evaluateMappingQuality(validated.data, safeInput);
  logger.info("MAPPING_QUALITY_EVALUATED", {
    sourceType: safeInput.sourceType,
    mappingConfidence: quality.mappingConfidence,
    warningCount: quality.warnings.length
  });

  return {
    requirement: validated.data,
    mappingConfidence: quality.mappingConfidence,
    warnings: quality.warnings
  };
};
