import mongoose, { Document, Schema } from "mongoose";

export interface IExtractionLog extends Document {
    status: string;
    requirement?: any;
    extractionModel?: string;
    azureEstimate?: any;
    candidate?: any;
    questions?: string[];
    issues?: any[];
    error?: string;
    details?: any;
    createdAt: Date;
}

const ExtractionLogSchema = new Schema<IExtractionLog>({
    status: { type: String, required: true },
    requirement: { type: Schema.Types.Mixed },
    extractionModel: { type: String },
    azureEstimate: { type: Schema.Types.Mixed },
    candidate: { type: Schema.Types.Mixed },
    questions: [{ type: String }],
    issues: [{ type: Schema.Types.Mixed }],
    error: { type: String },
    details: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now }
});

export const ExtractionLog = mongoose.model<IExtractionLog>("ExtractionLog", ExtractionLogSchema);
