import { analyzerResponseSchema, parserResponseSchema } from "../schemas/upload.schema";
import { requestJson } from "./http-client.service";

const analyzerBaseUrl =
  process.env.STRUCTURED_ANALYZER_URL ?? "http://127.0.0.1:4060";

type ParserOutput = ReturnType<typeof parserResponseSchema.parse>;

export const analyzeStructuredData = async (payload: ParserOutput) => {
  const response = await requestJson({
    url: `${analyzerBaseUrl}/analyze`,
    method: "POST",
    body: {
      rawInfrastructureData: payload.rawInfrastructureData,
      sourceType: payload.sourceType
    },
    schema: analyzerResponseSchema
  });

  return {
    documentType: response.documentType,
    serviceClassification: response.serviceClassification,
    computeCandidates: response.computeCandidates.map((item) => item.row),
    storageCandidates: response.storageCandidates.map((item) => item.row),
    databaseCandidates: response.databaseCandidates.map((item) => item.row),
    networkCandidates: response.networkCandidates.map((item) => item.row),
    detection: response.detection,
    stats: response.stats
  };
};
