import { Router } from "express";
import { analyzeController } from "../controllers/analyzer.controller";

const router = Router();

router.post("/analyze", analyzeController);

export default router;

