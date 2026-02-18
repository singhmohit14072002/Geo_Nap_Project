"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequirementPayload = void 0;
const requirement_schema_1 = require("../schemas/requirement.schema");
const compute_rules_1 = require("../rules/compute.rules");
const database_rules_1 = require("../rules/database.rules");
const network_rules_1 = require("../rules/network.rules");
const http_error_1 = require("../utils/http-error");
const logger_1 = __importDefault(require("../utils/logger"));
const uniqueQuestions = (issues) => {
    return Array.from(new Set(issues.map((item) => item.question))).filter(Boolean);
};
const toIssuesPayload = (issues) => {
    return issues.map((item) => ({
        code: item.code,
        path: item.path,
        message: item.message
    }));
};
const resolveRegion = (value) => {
    if (typeof value !== "string") {
        return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
};
const regionIssue = () => ({
    code: "REGION_MISSING",
    path: "region",
    message: "Deployment region is required.",
    question: "Which deployment region should be used?"
});
const validateRequirementPayload = (payload) => {
    const parsed = requirement_schema_1.validateRequestSchema.safeParse(payload);
    if (!parsed.success) {
        throw new http_error_1.HttpError(422, "Validation payload schema failed", parsed.error.flatten());
    }
    const requirement = "requirement" in parsed.data
        ? parsed.data.requirement
        : parsed.data;
    const issues = [];
    const computeResult = (0, compute_rules_1.validateCompute)(requirement);
    const databaseResult = (0, database_rules_1.validateDatabase)(requirement);
    const networkResult = (0, network_rules_1.validateNetwork)(requirement);
    issues.push(...computeResult.issues);
    issues.push(...databaseResult.issues);
    issues.push(...networkResult.issues);
    const region = resolveRegion(requirement.region);
    if (!region) {
        issues.push(regionIssue());
    }
    if (issues.length > 0) {
        logger_1.default.info("VALIDATION_NEEDS_CLARIFICATION", {
            issueCount: issues.length
        });
        return {
            status: "NEEDS_CLARIFICATION",
            questions: uniqueQuestions(issues),
            issues: toIssuesPayload(issues)
        };
    }
    const validatedRequirement = {
        compute: computeResult.normalized,
        database: databaseResult.normalized,
        network: networkResult.normalized,
        region: region
    };
    const strict = requirement_schema_1.validatedRequirementSchema.safeParse(validatedRequirement);
    if (!strict.success) {
        throw new http_error_1.HttpError(422, "Validated requirement failed strict schema check", strict.error.flatten());
    }
    logger_1.default.info("VALIDATION_SUCCESS", {
        computeItems: strict.data.compute.length
    });
    return {
        status: "VALID",
        validatedRequirement: strict.data
    };
};
exports.validateRequirementPayload = validateRequirementPayload;
