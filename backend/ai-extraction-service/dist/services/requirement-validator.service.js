"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateExtractedRequirement = void 0;
const zod_1 = require("zod");
const extraction_schema_1 = require("../schemas/extraction.schema");
const llm_client_service_1 = require("./llm-client.service");
const logger_1 = __importDefault(require("../utils/logger"));
const questionTemplateByIssue = {
    REGION_MISSING: "Which region should be used for deployment?",
    COMPUTE_MISSING: "Please provide at least one compute workload specification.",
    COMPUTE_CPU_MISSING: "What is the required vCPU count for each compute workload?",
    COMPUTE_RAM_MISSING: "What is the required RAM (GB) for each compute workload?",
    COMPUTE_STORAGE_GB_MISSING: "What storage capacity (GB) is needed per compute workload?",
    COMPUTE_STORAGE_TYPE_MISSING: "Which storage type should be used (ssd, hdd, or standard)?",
    COMPUTE_QUANTITY_MISSING: "How many instances are required for each compute workload?",
    COMPUTE_OS_MISSING: "Which operating system is required (linux or windows)?",
    DATABASE_MISSING: "Do you need a managed database? If yes, provide engine and size.",
    DATABASE_ENGINE_MISSING: "Which database engine should be used (postgres, mysql, mssql, or none)?",
    DATABASE_HA_UNDEFINED: "Is high availability required for the database?",
    NETWORK_MISSING: "Please provide expected outbound network traffic (data egress in GB).",
    NETWORK_EGRESS_MISSING_OR_ZERO: "What is the expected monthly data egress (GB)?",
    UNREALISTIC_COMPUTE_CONFIG: "One or more compute configurations look unrealistic. Please confirm CPU and RAM values."
};
const aiQuestionResponseSchema = zod_1.z.object({
    questions: zod_1.z.array(zod_1.z.string().min(1)).min(1)
});
const dedupeIssues = (issues) => {
    const seen = new Set();
    const unique = [];
    for (const issue of issues) {
        const key = `${issue.code}|${issue.detail}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(issue);
    }
    return unique;
};
const detectIssues = (input) => {
    const issues = [];
    if (!input.region || input.region.trim().length === 0) {
        issues.push({
            code: "REGION_MISSING",
            detail: "Region field is empty or null"
        });
    }
    if (!input.compute || input.compute.length === 0) {
        issues.push({
            code: "COMPUTE_MISSING",
            detail: "No compute workloads were extracted"
        });
    }
    else {
        input.compute.forEach((item, index) => {
            const label = `compute[${index}]`;
            if (item.vCPU == null) {
                issues.push({
                    code: "COMPUTE_CPU_MISSING",
                    detail: `${label}.vCPU is missing`
                });
            }
            if (item.ramGB == null) {
                issues.push({
                    code: "COMPUTE_RAM_MISSING",
                    detail: `${label}.ramGB is missing`
                });
            }
            if (item.storageGB == null) {
                issues.push({
                    code: "COMPUTE_STORAGE_GB_MISSING",
                    detail: `${label}.storageGB is missing`
                });
            }
            if (item.storageType === undefined || item.storageType === null) {
                issues.push({
                    code: "COMPUTE_STORAGE_TYPE_MISSING",
                    detail: `${label}.storageType is missing`
                });
            }
            if (item.quantity == null) {
                issues.push({
                    code: "COMPUTE_QUANTITY_MISSING",
                    detail: `${label}.quantity is missing`
                });
            }
            if (!item.osType) {
                issues.push({
                    code: "COMPUTE_OS_MISSING",
                    detail: `${label}.osType is missing`
                });
            }
            if (item.vCPU != null &&
                item.ramGB != null &&
                item.vCPU > 0 &&
                (item.vCPU <= 2 && item.ramGB >= 128 || item.ramGB / item.vCPU >= 32)) {
                issues.push({
                    code: "UNREALISTIC_COMPUTE_CONFIG",
                    detail: `${label} has potentially unrealistic ratio (${item.vCPU} vCPU, ${item.ramGB} GB RAM)`
                });
            }
        });
    }
    if (!input.database) {
        issues.push({
            code: "DATABASE_MISSING",
            detail: "Database block is missing"
        });
    }
    else {
        if (!input.database.engine) {
            issues.push({
                code: "DATABASE_ENGINE_MISSING",
                detail: "Database engine is missing"
            });
        }
        if (input.database.ha == null) {
            issues.push({
                code: "DATABASE_HA_UNDEFINED",
                detail: "Database HA flag is undefined"
            });
        }
    }
    if (!input.network) {
        issues.push({
            code: "NETWORK_MISSING",
            detail: "Network block is missing"
        });
    }
    else {
        const egress = input.network.dataEgressGB;
        if (egress == null || egress <= 0) {
            issues.push({
                code: "NETWORK_EGRESS_MISSING_OR_ZERO",
                detail: "Network egress is missing or zero"
            });
        }
    }
    return dedupeIssues(issues);
};
const buildDefaultQuestions = (issues) => {
    const seen = new Set();
    const questions = [];
    for (const issue of issues) {
        const question = questionTemplateByIssue[issue.code];
        if (!question || seen.has(question)) {
            continue;
        }
        seen.add(question);
        questions.push(question);
    }
    return questions;
};
const buildClarificationIssues = (issues) => {
    return issues.map((issue) => ({
        code: issue.code,
        detail: issue.detail,
        question: questionTemplateByIssue[issue.code]
    }));
};
const generateQuestionsWithAI = async (issues) => {
    const issueLines = issues.map((issue) => `- ${issue.code}: ${issue.detail}`);
    const prompt = [
        "Convert the following validation issues into concise clarification questions.",
        "Rules:",
        "1) Return only JSON object with one field: questions.",
        "2) questions must be an array of plain strings.",
        "3) Do not add assumptions or default values.",
        "4) Do not include pricing or cost-related suggestions.",
        "Issues:",
        ...issueLines
    ].join("\n");
    try {
        const content = await (0, llm_client_service_1.callLlm)([
            {
                role: "system",
                content: "You generate clarification questions only. You never infer values."
            },
            {
                role: "user",
                content: prompt
            }
        ], true);
        const parsed = JSON.parse(content);
        const validated = aiQuestionResponseSchema.safeParse(parsed);
        if (!validated.success) {
            return null;
        }
        return validated.data.questions;
    }
    catch (err) {
        logger_1.default.warn("Requirement validator AI question generation error", {
            error: err instanceof Error ? err.message : String(err)
        });
        return null;
    }
};
const validateExtractedRequirement = async (input) => {
    const issues = detectIssues(input);
    if (issues.length > 0) {
        const aiQuestions = await generateQuestionsWithAI(issues);
        const questions = aiQuestions && aiQuestions.length > 0
            ? aiQuestions
            : buildDefaultQuestions(issues);
        return {
            status: "NEEDS_CLARIFICATION",
            questions,
            issues: buildClarificationIssues(issues)
        };
    }
    const normalizedForValidation = {
        compute: (input.compute ?? []).map((item) => ({
            vCPU: item.vCPU,
            ramGB: item.ramGB,
            storageGB: item.storageGB,
            osType: item.osType,
            quantity: item.quantity
        })),
        database: {
            engine: input.database?.engine,
            storageGB: input.database?.storageGB,
            ha: input.database?.ha
        },
        network: {
            dataEgressGB: input.network?.dataEgressGB
        },
        region: input.region
    };
    const strict = extraction_schema_1.extractedRequirementSchema.safeParse(normalizedForValidation);
    if (!strict.success) {
        const fallbackIssues = [
            {
                code: "COMPUTE_MISSING",
                detail: "Extracted requirement did not pass strict schema validation"
            }
        ];
        return {
            status: "NEEDS_CLARIFICATION",
            questions: buildDefaultQuestions(fallbackIssues),
            issues: buildClarificationIssues(fallbackIssues)
        };
    }
    return {
        status: "VALID",
        requirement: strict.data
    };
};
exports.validateExtractedRequirement = validateExtractedRequirement;
