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
    documentType: "CLOUD_ESTIMATE" | "REQUIREMENT";
    detection: {
      score: number;
      matchedSignals: string[];
    };
    serviceClassification: {
      summary: {
        COMPUTE_VM: number;
        STORAGE_DISK: number;
        NETWORK_GATEWAY: number;
        NETWORK_EGRESS: number;
        BACKUP: number;
        AUTOMATION: number;
        MONITORING: number;
        LOGIC_APPS: number;
        OTHER: number;
      };
      totalClassifiedRows: number;
    };
    stats: {
      totalRows: number;
      classifiedRows: number;
      discardedRows: number;
    };
  };
  mappingConfidence: number;
  mappingWarnings: string[];
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
