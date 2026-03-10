import { Router } from "express";
import { importEstimateController } from "../controllers/import.controller";

const router = Router();

router.post("/import", importEstimateController);

export default router;
