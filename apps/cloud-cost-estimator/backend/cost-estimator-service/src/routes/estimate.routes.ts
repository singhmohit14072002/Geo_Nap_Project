import { Router } from "express";
import {
  createEstimateJobController,
  downloadEstimateReportController,
  getEstimateJobController
} from "../controllers/estimate.controller";
import { pricingRateLimiter } from "../middlewares/rate-limit.middleware";

const estimateRouter = Router();

estimateRouter.post("/estimate", pricingRateLimiter, createEstimateJobController);
estimateRouter.get("/estimate/:jobId", getEstimateJobController);
estimateRouter.get("/estimate/:jobId/report", downloadEstimateReportController);

export default estimateRouter;
