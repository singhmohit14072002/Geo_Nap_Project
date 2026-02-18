import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
import morgan from "morgan";
import parserRoutes from "./routes/parser.routes";

const app = express();

app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "document-parser-service",
    timestamp: new Date().toISOString()
  });
});

app.use("/", parserRoutes);

app.use((_req, res) => {
  res.status(404).json({
    error: "Not Found"
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const statusCode =
    typeof err === "object" &&
    err !== null &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
      ? (err as { statusCode: number }).statusCode
      : 500;

  const message =
    err instanceof Error && err.message ? err.message : "Internal server error";

  res.status(statusCode).json({
    error: message
  });
});

export default app;
