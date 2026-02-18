"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFileType = void 0;
const path_1 = __importDefault(require("path"));
const mime_types_1 = require("mime-types");
const MIME_MAP = {
    "application/xml": "xml",
    "text/xml": "xml",
    "application/vnd.ms-excel": "excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "word"
};
const EXT_MAP = {
    ".xml": "xml",
    ".xlsx": "excel",
    ".xls": "excel",
    ".pdf": "pdf",
    ".docx": "word"
};
const detectFileType = (file) => {
    const ext = path_1.default.extname(file.originalname || "").toLowerCase();
    if (ext in EXT_MAP) {
        return EXT_MAP[ext];
    }
    const mime = (file.mimetype || "").toLowerCase();
    if (mime in MIME_MAP) {
        return MIME_MAP[mime];
    }
    const fromLookup = ((0, mime_types_1.lookup)(file.originalname || "") || "").toString().toLowerCase();
    if (fromLookup in MIME_MAP) {
        return MIME_MAP[fromLookup];
    }
    throw Object.assign(new Error("Unsupported file type. Supported: XML, Excel, PDF, DOCX"), {
        statusCode: 415
    });
};
exports.detectFileType = detectFileType;
