"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const estimate_controller_1 = require("../controllers/estimate.controller");
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "20");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: Math.max(1, maxUploadMb) * 1024 * 1024
    }
});
const router = (0, express_1.Router)();
router.post("/estimate/upload", upload.single("file"), estimate_controller_1.uploadEstimateController);
router.get("/estimate/:jobId/status", estimate_controller_1.estimateStatusController);
router.get("/estimate/:jobId/result", estimate_controller_1.estimateResultController);
exports.default = router;
