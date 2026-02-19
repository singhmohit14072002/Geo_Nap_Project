import { Router } from "express";
import { explainController } from "../controllers/explain.controller";

const router = Router();

router.post("/explain", explainController);

export default router;

