"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const estimate_controller_1 = require("../controllers/estimate.controller");
const estimateRouter = (0, express_1.Router)();
estimateRouter.post("/estimate", estimate_controller_1.createEstimateJobController);
estimateRouter.get("/estimate/:jobId", estimate_controller_1.getEstimateJobController);
estimateRouter.get("/estimate/:jobId/report", estimate_controller_1.downloadEstimateReportController);
exports.default = estimateRouter;
