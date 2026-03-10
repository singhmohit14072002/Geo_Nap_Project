import { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
}

export interface JwtClaims {
  sub: string;
  email: string;
  orgId: string;
  role: UserRole;
}
