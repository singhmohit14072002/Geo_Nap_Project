"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = require("winston");
const logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL ?? "info",
    defaultMeta: { service: "estimation-explainability-service" },
    format: winston_1.format.combine(winston_1.format.timestamp(), winston_1.format.errors({ stack: true }), winston_1.format.json()),
    transports: [new winston_1.transports.Console()]
});
exports.default = logger;
