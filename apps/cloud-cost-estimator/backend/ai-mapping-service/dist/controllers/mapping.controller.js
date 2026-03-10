"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mappingController = void 0;
const ai_mapping_service_1 = require("../services/ai-mapping.service");
const mappingController = async (req, res, next) => {
    try {
        const result = await (0, ai_mapping_service_1.mapInfrastructure)(req.body);
        res.status(200).json({
            requirement: result.requirement,
            mappingConfidence: result.mappingConfidence,
            warnings: result.warnings
        });
    }
    catch (error) {
        next(error);
    }
};
exports.mappingController = mappingController;
