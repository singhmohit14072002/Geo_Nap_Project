import { NextFunction, Request, Response } from "express";
import { extractRequirementFromParsedInput } from "../services/ai-extraction.service";
import { parseUploadedFile } from "../services/file-parser.service";
import { validateExtractedRequirement } from "../services/requirement-validator.service";
import { applyClarifications } from "../services/requirement-clarifier.service";
import { extractCloudEstimateFromParsedInput } from "../services/cloud-estimate-extractor.service";
import { parseAzureEstimateExcel, parseAzureEstimateText } from "../services/azure-excel-parser.service";
import { whisperExtractText } from "../services/llmwhisperer.service";
import {
  incrementExtractionFailuresTotal,
  incrementExtractionRequestsTotal
} from "../metrics/metrics.service";
import { HttpError } from "../utils/http-error";
import { extractionClarifyRequestSchema } from "../schemas/extraction.schema";
import logger from "../utils/logger";

export const extractController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    incrementExtractionRequestsTotal();
    const file = req.file;
    if (!file) {
      throw new HttpError(400, "No file uploaded. Provide 'file' in multipart/form-data.");
    }

    // ----- FAST PATH: Azure estimate detection (XLSX/PDF) before any generic normalization -----
    const isExcel =
      file.mimetype?.toLowerCase().includes("excel") ||
      file.originalname.toLowerCase().endsWith(".xlsx") ||
      file.originalname.toLowerCase().endsWith(".xls");
    const isPdf =
      file.mimetype?.toLowerCase().includes("pdf") ||
      file.originalname.toLowerCase().endsWith(".pdf");

    if (isExcel || isPdf) {
      try {
        // Try LLMWhisperer first if configured
        let rows = [] as Awaited<ReturnType<typeof parseAzureEstimateExcel>>;
        const text = await whisperExtractText(file.buffer, file.originalname);
        if (text) rows = parseAzureEstimateText(text);
        if (rows.length === 0 && isExcel) {
          rows = await parseAzureEstimateExcel(file.buffer);
        }
        // eslint-disable-next-line no-console
        console.log("RAW PARSED ROWS:", rows);
        const isAzureEstimate = rows.some(
          (r) => r.serviceCategory && r.serviceType && r.description !== undefined
        );
        if (isAzureEstimate) {
          logger.info("AZURE_ESTIMATE_MODE_DETECTED_EARLY", {
            fileName: file.originalname,
            rows: rows.length
          });
          res.status(200).json({
            status: "VALID",
            requirement: {
              compute: [],
              database: { engine: "none", storageGB: 0, ha: false },
              network: { dataEgressGB: 0 },
              region: rows[0]?.region || "centralindia"
            },
            extractionModel: "azure_estimate_excel",
            azureEstimate: {
              documentType: "CLOUD_ESTIMATE",
              mode: "AZURE_ESTIMATE_MODE",
              classifiedServices: rows
            }
          });
          return;
        }
      } catch (err) {
        logger.warn("AZURE_XLSX_EARLY_PARSE_FAILED", {
          fileName: file.originalname,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    // ------------------------------------------------------------------------

    const parsed = await parseUploadedFile(file);

    // Azure estimate Excel shortcut: bypass AI and return structured rows.
    if (
      parsed.fileType === "azure_estimate_excel" &&
      Array.isArray(parsed.azureEstimateRows) &&
      parsed.azureEstimateRows.length > 0
    ) {
      logger.info("AZURE_ESTIMATE_MODE_DETECTED", {
        fileName: file.originalname,
        rows: parsed.azureEstimateRows.length
      });

      res.status(200).json({
        status: "VALID",
        requirement: {
          compute: [],
          database: { engine: "none", storageGB: 0, ha: false },
          network: { dataEgressGB: 0 },
          region: parsed.azureEstimateRows[0]?.region || "centralindia"
        },
        extractionModel: "azure_estimate_excel",
        azureEstimate: {
          documentType: "CLOUD_ESTIMATE",
          mode: "AZURE_ESTIMATE_MODE",
          classifiedServices: parsed.azureEstimateRows
        }
      });
      return;
    }

    const cloudEstimate = extractCloudEstimateFromParsedInput(parsed);
    if (parsed.fileType === "xml") {
      const structured = parsed.normalizedInput.structured as
        | { servers?: unknown[] }
        | undefined;
      logger.info("XML_PARSED_SUCCESS", {
        fileName: file.originalname,
        serverEntries: Array.isArray(structured?.servers) ? structured.servers.length : 0
      });
    }

    if (cloudEstimate) {
      logger.info("CLOUD_ESTIMATE_MODE_SELECTED", {
        fileName: file.originalname,
        mode: cloudEstimate.mode,
        classifiedServices: cloudEstimate.classifiedServices.length
      });
    }

    const extractionResult = await extractRequirementFromParsedInput(parsed);
    if (extractionResult.status === "EXTRACTION_FAILED") {
      if (cloudEstimate) {
        res.status(200).json({
          status: "VALID",
          requirement: cloudEstimate.requirement,
          extractionModel: "heuristic_cloud_estimate",
          azureEstimate: {
            documentType: cloudEstimate.documentType,
            mode: cloudEstimate.mode,
            classifiedServices: cloudEstimate.classifiedServices
          }
        });
        return;
      }

      res.status(200).json({
        status: "EXTRACTION_FAILED",
        error: extractionResult.error,
        details: extractionResult.details
      });
      return;
    }

    const requirement = extractionResult.candidate;
    const validationResult = await validateExtractedRequirement(requirement);

    if (cloudEstimate) {
      res.status(200).json({
        status: "VALID",
        requirement: cloudEstimate.requirement,
        extractionModel: extractionResult.model,
        azureEstimate: {
          documentType: cloudEstimate.documentType,
          mode: cloudEstimate.mode,
          classifiedServices: cloudEstimate.classifiedServices
        }
      });
      return;
    }

    if (validationResult.status === "VALID") {
      res.status(200).json({
        status: "VALID",
        requirement: validationResult.requirement,
        extractionModel: extractionResult.model
      });
      return;
    }

    res.status(200).json({
      status: "NEEDS_CLARIFICATION",
      candidate: requirement,
      questions: validationResult.questions,
      issues: validationResult.issues,
      extractionModel: extractionResult.model
    });
  } catch (error) {
    incrementExtractionFailuresTotal();
    next(error);
  }
};

export const clarifyController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    incrementExtractionRequestsTotal();
    const parsed = extractionClarifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(422, "Clarification payload validation failed", parsed.error.flatten());
    }

    const mergedCandidate = applyClarifications(
      parsed.data.candidate,
      parsed.data.clarifications
    );
    const validationResult = await validateExtractedRequirement(mergedCandidate);

    if (validationResult.status === "VALID") {
      res.status(200).json({
        status: "VALID",
        requirement: validationResult.requirement
      });
      return;
    }

    res.status(200).json({
      status: "NEEDS_CLARIFICATION",
      candidate: mergedCandidate,
      questions: validationResult.questions,
      issues: validationResult.issues
    });
  } catch (error) {
    incrementExtractionFailuresTotal();
    next(error);
  }
};
