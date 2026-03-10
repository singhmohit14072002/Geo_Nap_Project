import { Router } from "express";
import { listLatestAvailability } from "../db/intelligence.repository";

export const intelligenceRouter = Router();

intelligenceRouter.get("/v1/intelligence/availability", async (req, res) => {
  const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;
  const region = typeof req.query.region === "string" ? req.query.region : undefined;
  const availability = await listLatestAvailability(provider, region);
  res.status(200).json({ availability });
});
