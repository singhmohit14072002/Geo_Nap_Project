import { Router } from "express";
import { recommendProviderController } from "../controllers/decision.controller";

const router = Router();

router.post("/recommend", recommendProviderController);

export default router;

