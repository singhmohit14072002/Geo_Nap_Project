import { NextFunction, Request, Response } from "express";
import prisma from "../db/prisma";
import { HttpError } from "../utils/http-error.util";
import { verifyJwt } from "../utils/jwt.util";

const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader) {
    throw new HttpError(401, "Authorization header is required");
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new HttpError(401, "Authorization must be Bearer token");
  }
  return token;
};

export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const claims = verifyJwt(token);

    const user = await prisma.user.findUnique({
      where: { id: claims.sub }
    });
    if (!user) {
      throw new HttpError(401, "Invalid authentication token");
    }

    req.authUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) {
      next(error);
      return;
    }
    next(new HttpError(401, "Unauthorized"));
  }
};
