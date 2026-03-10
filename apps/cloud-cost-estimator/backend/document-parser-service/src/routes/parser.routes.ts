import { Router } from "express";
import multer from "multer";
import { parseController } from "../controllers/parser.controller";

const maxUploadMb = Number(process.env.MAX_UPLOAD_MB ?? "20");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(1, maxUploadMb) * 1024 * 1024
  }
});

const router = Router();

router.post("/parse", upload.single("file"), parseController);

export default router;
