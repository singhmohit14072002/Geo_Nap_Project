import { Router } from "express";
import { NotFoundError, PlanRecord, planRequestSchema, ValidationError } from "@geo-nap/common";
import { v4 as uuidv4 } from "uuid";
import { getPlanById, getRecommendations, insertPlan } from "../db/plans.repository";
import { publishEvent } from "../queue/rabbitmq";

export const plansRouter = Router();

plansRouter.post("/v1/plans", async (req, res) => {
  const parsed = planRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError("Invalid plan request", parsed.error.flatten());
  }

  if (!parsed.data.parity_mode) {
    throw new ValidationError("Geo-NAP platform currently supports parity_mode=true only");
  }

  const now = new Date().toISOString();
  const planId = uuidv4();

  const plan: PlanRecord = {
    id: planId,
    request: parsed.data,
    status: "queued",
    createdAt: now,
    updatedAt: now
  };

  await insertPlan(plan);

  await publishEvent("plan.created", {
    eventType: "plan.created",
    payload: {
      planId,
      request: parsed.data
    }
  });

  res.status(202).json({
    plan_id: planId,
    status: "queued"
  });
});

plansRouter.get("/v1/plans/:planId", async (req, res) => {
  const planId = req.params.planId;
  const plan = await getPlanById(planId);
  if (!plan) {
    throw new NotFoundError(`Plan not found: ${planId}`);
  }

  const recommendationBundle =
    plan.status === "recommended"
      ? await getRecommendations(planId)
      : {
          ranked: [],
          cheapest: null,
          nearest: null,
          balanced: null,
          providerOptions: { aws: [], azure: [], gcp: [], vast: [] }
        };

  res.status(200).json({
    plan,
    recommendations: recommendationBundle.ranked,
    cheapest_option: recommendationBundle.cheapest,
    nearest_option: recommendationBundle.nearest,
    balanced_option: recommendationBundle.balanced,
    provider_options: recommendationBundle.providerOptions
  });
});
