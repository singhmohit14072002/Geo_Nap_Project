import {
  MapRequest,
  requirementSchemaContract,
  requirementSchemaTemplate
} from "../schemas/requirement.schema";

export const buildMappingPrompt = (input: MapRequest): string => {
  return [
    "You are a cloud infrastructure schema mapper.",
    "Input is structured and pre-filtered infrastructure JSON.",
    "Task: Fill only the required schema fields using input evidence.",
    "",
    "Rules:",
    "1) Return JSON only. No markdown, no explanations.",
    "2) Do not calculate pricing, discounts, or recommendations.",
    "3) Do not guess values. If a value is missing, set it to null.",
    "4) Keep exact schema keys and structure. Do not add or remove keys.",
    "5) Keep osType only as linux, windows, or null.",
    "6) Use numbers for numeric fields when evidence exists, otherwise null.",
    "7) Keep compute as an array. Use one object per detected compute workload.",
    "8) If no compute workload is found, return compute as [] (empty array).",
    "",
    "Schema template (fill this shape):",
    JSON.stringify(requirementSchemaTemplate, null, 2),
    "",
    "Schema contract (must be followed strictly):",
    JSON.stringify(requirementSchemaContract, null, 2),
    "",
    "Input payload:",
    JSON.stringify(input, null, 2)
  ].join("\n");
};
