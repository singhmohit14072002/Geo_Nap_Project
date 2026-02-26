import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected
} from "@azure-rest/ai-document-intelligence";
import { env } from "../config/env";

const client = DocumentIntelligence(env.azureDocEndpoint, {
  key: env.azureDocKey
});

export interface AzureDocumentParseOutput {
  textContent: string;
  pageCount: number;
  tableCount: number;
  paragraphCount: number;
}

const extractMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const parseWithAzureDocumentIntelligence = async (
  fileBuffer: Buffer
): Promise<AzureDocumentParseOutput> => {
  const initialResponse = await client
    .path("/documentModels/{modelId}:analyze", "prebuilt-layout")
    .post({
      contentType: "application/json",
      body: {
        base64Source: fileBuffer.toString("base64")
      },
      queryParameters: {
        outputContentFormat: "markdown"
      }
    });

  if (isUnexpected(initialResponse)) {
    const errorMessage =
      (initialResponse.body as { error?: { message?: string } })?.error?.message ??
      "Unexpected Azure Document Intelligence response";
    throw Object.assign(new Error(errorMessage), { statusCode: 502 });
  }

  try {
    const poller = getLongRunningPoller(client, initialResponse);
    const finalResponse = await poller.pollUntilDone();
    const analyzeResult = (finalResponse as { body?: { analyzeResult?: Record<string, unknown> } })
      .body?.analyzeResult;

    const textContentRaw = analyzeResult?.content;
    const textContent = typeof textContentRaw === "string" ? textContentRaw.trim() : "";
    if (!textContent) {
      throw Object.assign(new Error("Azure Document Intelligence returned empty content"), {
        statusCode: 422
      });
    }

    const pages = Array.isArray(analyzeResult?.pages) ? analyzeResult.pages : [];
    const tables = Array.isArray(analyzeResult?.tables) ? analyzeResult.tables : [];
    const paragraphs = Array.isArray(analyzeResult?.paragraphs)
      ? analyzeResult.paragraphs
      : [];

    return {
      textContent,
      pageCount: pages.length,
      tableCount: tables.length,
      paragraphCount: paragraphs.length
    };
  } catch (error) {
    const message = extractMessage(error);
    throw Object.assign(new Error(`Azure Document Intelligence analysis failed: ${message}`), {
      statusCode:
        typeof error === "object" && error !== null && "statusCode" in error
          ? (error as { statusCode: number }).statusCode
          : 502
    });
  }
};
