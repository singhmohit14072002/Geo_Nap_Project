"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const extract_controller_1 = require("../controllers/extract.controller");
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "10");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: Math.max(1, maxUploadMb) * 1024 * 1024
    }
});
const router = (0, express_1.Router)();
router.post("/extract", upload.single("file"), extract_controller_1.extractController);
router.post("/extract/clarify", extract_controller_1.clarifyController);
exports.default = router;
