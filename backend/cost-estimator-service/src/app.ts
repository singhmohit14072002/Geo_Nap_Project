import cors from "cors";
import express from "express";
import morgan from "morgan";
import { metricsRegistry } from "./metrics/metrics.service";
import { authMiddleware } from "./middlewares/auth.middleware";
import { metricsMiddleware } from "./middlewares/metrics.middleware";
import authRouter from "./routes/auth.routes";
import estimateRouter from "./routes/estimate.routes";
import projectRouter from "./routes/project.routes";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));
app.use(metricsMiddleware);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    ok: true,
    service: "cost-estimator-service",
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    timestamp: new Date().toISOString()
  });
});

app.get("/metrics", async (_req, res, next) => {
  try {
    res.set("Content-Type", metricsRegistry.contentType);
    res.status(200).send(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});

app.use("/auth", authRouter);
app.use(authMiddleware);
app.use("/", projectRouter);
app.use("/", estimateRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
