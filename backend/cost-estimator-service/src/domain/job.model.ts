export type JobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface EstimateJob {
  jobId: string;
  status: JobStatus;
  userId: string;
  organizationId: string;
  projectId: string;
  requestPayload: any;
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
