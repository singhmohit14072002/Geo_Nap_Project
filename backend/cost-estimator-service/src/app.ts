import cors from "cors";
import express from "express";
import morgan from "morgan";
import estimateRouter from "./routes/estimate.routes";
import { errorMiddleware, notFoundMiddleware } from "./middlewares/error.middleware";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "cost-estimator-service",
    timestamp: new Date().toISOString()
  });
});

app.use("/", estimateRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;

