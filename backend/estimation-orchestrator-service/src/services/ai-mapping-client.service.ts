import { mappingResponseSchema } from "../schemas/upload.schema";
import { requestJson } from "./http-client.service";

const mappingBaseUrl = process.env.AI_MAPPING_URL ?? "http://127.0.0.1:4030";

interface MappingInput {
  rawInfrastructureData: Record<string, unknown>;
  sourceType: "xml" | "excel" | "pdf" | "word";
}

export const mapInfrastructure = async (payload: MappingInput) => {
  const response = await requestJson({
    url: `${mappingBaseUrl}/map`,
    method: "POST",
    body: {
      rawInfrastructureData: payload.rawInfrastructureData,
      sourceType: payload.sourceType
    },
    schema: mappingResponseSchema
  });

  return {
    requirement: response.requirement,
    mappingConfidence: response.mappingConfidence,
    warnings: response.warnings
  };
};
