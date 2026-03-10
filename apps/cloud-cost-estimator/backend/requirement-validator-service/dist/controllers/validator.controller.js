"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequirementController = void 0;
const validator_service_1 = require("../services/validator.service");
const validateRequirementController = (req, res) => {
    const result = (0, validator_service_1.validateRequirementPayload)(req.body);
    res.status(200).json(result);
};
exports.validateRequirementController = validateRequirementController;
