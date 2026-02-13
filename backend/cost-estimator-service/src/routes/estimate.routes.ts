import { Router } from "express";
import {
  createEstimateJobController,
  getEstimateJobController
} from "../controllers/estimate.controller";

const estimateRouter = Router();

estimateRouter.post("/estimate", createEstimateJobController);
estimateRouter.get("/estimate/:jobId", getEstimateJobController);

export default estimateRouter;
