"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const logger_1 = __importDefault(require("./utils/logger"));
const mongodb_1 = require("./db/mongodb");
dotenv_1.default.config();
const port = Number(process.env.PORT ?? 4010);
(0, mongodb_1.connectMongoDB)().then(() => {
    app_1.default.listen(port, () => {
        logger_1.default.info("Service started", {
            port,
            environment: process.env.NODE_ENV ?? "development"
        });
    });
});
