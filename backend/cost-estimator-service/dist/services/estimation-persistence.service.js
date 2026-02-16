"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveEstimationResult = void 0;
const prisma_1 = __importDefault(require("../db/prisma"));
const derivePricingVersion = (results) => {
    const versions = Array.from(new Set(results.map((item) => item.pricingVersion).filter(Boolean)));
    if (versions.length === 0) {
        return "unknown";
    }
    return versions.join(",");
};
const saveEstimationResult = async (input) => {
    await prisma_1.default.estimation.create({
        data: {
            projectId: input.projectId,
            requirementJson: input.requirementJson,
            resultJson: input.resultJson,
            pricingVersion: derivePricingVersion(input.resultJson)
        }
    });
};
exports.saveEstimationResult = saveEstimationResult;
