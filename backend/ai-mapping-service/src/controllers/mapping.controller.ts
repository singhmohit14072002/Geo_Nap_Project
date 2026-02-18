import { NextFunction, Request, Response } from "express";
import { mapInfrastructure } from "../services/ai-mapping.service";

export const mappingController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const requirement = await mapInfrastructure(req.body);
    res.status(200).json({
      requirement
    });
  } catch (error) {
    next(error);
  }
};
