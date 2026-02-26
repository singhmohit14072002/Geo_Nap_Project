"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdfFile = void 0;
const document_intelligence_adapter_1 = require("../adapters/document-intelligence.adapter");
const parsePdfFile = async (file) => {
    const rows = await (0, document_intelligence_adapter_1.analyzePdf)(file.buffer);
    return {
        rawInfrastructureData: {
            rows
        },
        sourceType: "pdf",
        parsingConfidence: 0.92
    };
};
exports.parsePdfFile = parsePdfFile;
