export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface EstimateJob {
  jobId: string;
  status: JobStatus;
  requestPayload: any;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

