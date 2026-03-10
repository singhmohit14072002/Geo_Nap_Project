"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeController = void 0;
const analyzer_service_1 = require("../services/analyzer.service");
const analyzeController = (req, res, next) => {
    try {
        const result = (0, analyzer_service_1.analyzeStructuredData)(req.body);
        res.status(200).json(result);
    }
    catch (error) {
        next(error);
    }
};
exports.analyzeController = analyzeController;
