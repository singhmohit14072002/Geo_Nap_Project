import { NextFunction, Request, Response } from "express";
import { parseDocument } from "../services/parser.service";

export const parseController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const file = req.file;
    if (!file) {
      throw Object.assign(new Error("No file uploaded. Provide 'file' in multipart/form-data."), {
        statusCode: 400
      });
    }

    const output = await parseDocument(file);
    res.status(200).json(output);
  } catch (error) {
    next(error);
  }
};
