import { NextFunction, Request, Response } from "express";
import { extractRequirementFromParsedInput } from "../services/ai-extraction.service";
import { parseUploadedFile } from "../services/file-parser.service";
import { validateExtractedRequirement } from "../services/requirement-validator.service";
import { applyClarifications } from "../services/requirement-clarifier.service";
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

    const parsed = await parseUploadedFile(file);
    if (parsed.fileType === "xml") {
      const structured = parsed.normalizedInput.structured as
        | { servers?: unknown[] }
        | undefined;
      logger.info("XML_PARSED_SUCCESS", {
        fileName: file.originalname,
        serverEntries: Array.isArray(structured?.servers) ? structured.servers.length : 0
      });
    }

    const extractionResult = await extractRequirementFromParsedInput(parsed);
    if (extractionResult.status === "EXTRACTION_FAILED") {
      res.status(200).json({
        status: "EXTRACTION_FAILED",
        error: extractionResult.error,
        details: extractionResult.details
      });
      return;
    }

    const requirement = extractionResult.candidate;
    const validationResult = await validateExtractedRequirement(requirement);

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
