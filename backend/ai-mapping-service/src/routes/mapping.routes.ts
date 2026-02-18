import { Router } from "express";
import { mappingController } from "../controllers/mapping.controller";

const router = Router();

router.post("/map", mappingController);

export default router;
