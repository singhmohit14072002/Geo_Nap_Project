import { Router } from "express";
import {
  createEstimateJobController,
  downloadEstimateReportController,
  getEstimateJobController
} from "../controllers/estimate.controller";

const estimateRouter = Router();

estimateRouter.post("/estimate", createEstimateJobController);
estimateRouter.get("/estimate/:jobId", getEstimateJobController);
estimateRouter.get("/estimate/:jobId/report", downloadEstimateReportController);

export default estimateRouter;
