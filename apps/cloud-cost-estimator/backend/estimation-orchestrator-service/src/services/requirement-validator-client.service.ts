import {
  validatorNeedsResponseSchema,
  validatorValidResponseSchema
} from "../schemas/upload.schema";
import { HttpError } from "../utils/http-error";
import { requestJson } from "./http-client.service";

const validatorBaseUrl =
  process.env.REQUIREMENT_VALIDATOR_URL ?? "http://127.0.0.1:4040";

export type ValidatorResponse =
  | {
      status: "VALID";
      validatedRequirement: Record<string, unknown>;
    }
  | {
      status: "NEEDS_CLARIFICATION";
      questions: string[];
      issues: Array<{ code: string; path: string; message: string }>;
    };

export const validateRequirement = async (
  requirement: Record<string, unknown>
): Promise<ValidatorResponse> => {
  const response = await requestJson({
    url: `${validatorBaseUrl}/validate`,
    method: "POST",
    body: requirement
  });

  const validParsed = validatorValidResponseSchema.safeParse(response);
  if (validParsed.success) {
    return validParsed.data;
  }

  const needsParsed = validatorNeedsResponseSchema.safeParse(response);
  if (needsParsed.success) {
    return needsParsed.data;
  }

  throw new HttpError(
    502,
    "requirement-validator-service response schema mismatch",
    response
  );
};
