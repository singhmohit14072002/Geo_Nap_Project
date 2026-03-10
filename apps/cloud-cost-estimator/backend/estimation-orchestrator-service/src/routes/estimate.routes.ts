import { Router } from "express";
import multer from "multer";
import {
  estimateResultController,
  estimateStatusController,
  uploadEstimateController
} from "../controllers/estimate.controller";

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "20");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(1, maxUploadMb) * 1024 * 1024
  }
});

const router = Router();

router.post("/estimate/upload", upload.single("file"), uploadEstimateController);
router.get("/estimate/:jobId/status", estimateStatusController);
router.get("/estimate/:jobId/result", estimateResultController);

export default router;

