import { Router } from "express";
import { validateRequirementController } from "../controllers/validator.controller";

const router = Router();

router.post("/validate", validateRequirementController);

export default router;

