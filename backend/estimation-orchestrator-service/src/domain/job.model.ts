export type CloudProvider = "azure" | "aws" | "gcp";

export type OrchestrationStatus =
  | "PENDING"
  | "PARSING"
  | "ANALYZING"
  | "MAPPING"
  | "VALIDATING"
  | "SUBMITTING_ESTIMATION"
  | "WAITING_ESTIMATION"
  | "NEEDS_CLARIFICATION"
  | "COMPLETED"
  | "FAILED";

export interface UploadOptions {
  cloudProviders: CloudProvider[];
  regionOverride: string | null;
  projectName: string | null;
}

export interface UploadedFilePayload {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

export interface ClarificationIssue {
  code: string;
  path: string;
  message: string;
}

export interface ClarificationResult {
  questions: string[];
  issues: ClarificationIssue[];
}

export interface EstimationResultPayload {
  parserOutput: {
    sourceType: "xml" | "excel" | "pdf" | "word";
    parsingConfidence: number;
  };
  analyzerOutput: {
    stats: {
      totalRows: number;
      classifiedRows: number;
      discardedRows: number;
    };
  };
  mappedRequirement: Record<string, unknown>;
  validatedRequirement: Record<string, unknown>;
  estimatorJobId: string;
  estimatorResult: unknown;
}

export interface OrchestrationError {
  stage: OrchestrationStatus;
  message: string;
  details?: unknown;
}

export interface EstimationJob {
  jobId: string;
  status: OrchestrationStatus;
  options: UploadOptions;
  file: UploadedFilePayload | null;
  clarification: ClarificationResult | null;
  result: EstimationResultPayload | null;
  error: OrchestrationError | null;
  createdAt: string;
  updatedAt: string;
}
