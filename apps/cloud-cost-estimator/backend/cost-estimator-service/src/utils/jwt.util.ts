import jwt from "jsonwebtoken";
import { JwtClaims } from "../types/auth.types";

const DEFAULT_JWT_EXPIRES_IN = "7d";
const DEVELOPMENT_FALLBACK_SECRET = "geo-nap-dev-local-jwt-secret-change-me";

const getSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16) {
    const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
    if (nodeEnv !== "production") {
      return DEVELOPMENT_FALLBACK_SECRET;
    }
    throw new Error("JWT_SECRET must be configured and at least 16 characters");
  }
  return secret;
};

export const signJwt = (claims: JwtClaims): string => {
  const expiresIn =
    (process.env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] | undefined) ??
    DEFAULT_JWT_EXPIRES_IN;

  return jwt.sign(claims, getSecret(), {
    expiresIn,
    issuer: "geo-nap"
  });
};

export const verifyJwt = (token: string): JwtClaims => {
  return jwt.verify(token, getSecret(), {
    issuer: "geo-nap"
  }) as JwtClaims;
};
