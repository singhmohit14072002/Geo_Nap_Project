"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = __importDefault(require("./utils/logger"));
app_1.default.listen(env_1.env.port, () => {
    logger_1.default.info("Service started", {
        port: env_1.env.port,
        environment: env_1.env.nodeEnv
    });
});
