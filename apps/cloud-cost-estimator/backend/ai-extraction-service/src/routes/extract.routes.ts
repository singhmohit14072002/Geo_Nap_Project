import { Router } from "express";
import multer from "multer";
import {
  clarifyController,
  extractController
} from "../controllers/extract.controller";

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "10");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(1, maxUploadMb) * 1024 * 1024
  }
});

const router = Router();

router.post("/extract", upload.single("file"), extractController);
router.post("/extract/clarify", clarifyController);

export default router;
