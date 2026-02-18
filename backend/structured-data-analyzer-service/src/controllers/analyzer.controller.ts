import { NextFunction, Request, Response } from "express";
import { analyzeStructuredData } from "../services/analyzer.service";

export const analyzeController = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const result = analyzeStructuredData(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

