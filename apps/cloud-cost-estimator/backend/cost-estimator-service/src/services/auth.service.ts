import bcrypt from "bcrypt";
import prisma from "../db/prisma";
import { LoginInput, RegisterInput } from "../schemas/auth.schema";
import { HttpError } from "../utils/http-error.util";
import { signJwt } from "../utils/jwt.util";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? "12");

const toAuthResponse = (
  user: {
    id: string;
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    organizationId: string;
  },
  organization: {
    id: string;
    name: string;
  }
) => {
  const token = signJwt({
    sub: user.id,
    email: user.email,
    orgId: user.organizationId,
    role: user.role
  });
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    },
    organization
  };
};

export const registerUser = async (input: RegisterInput) => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() }
  });
  if (existing) {
    throw new HttpError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const data = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        name: input.organizationName
      }
    });

    const user = await tx.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        role: "OWNER",
        organizationId: organization.id
      }
    });

    await tx.organization.update({
      where: { id: organization.id },
      data: { ownerId: user.id }
    });

    return {
      user,
      organization
    };
  });

  return toAuthResponse(
    {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
      organizationId: data.user.organizationId
    },
    {
      id: data.organization.id,
      name: data.organization.name
    }
  );
};

export const loginUser = async (input: LoginInput) => {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: {
      organization: true
    }
  });

  if (!user) {
    throw new HttpError(401, "Invalid email or password");
  }

  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    throw new HttpError(401, "Invalid email or password");
  }

  return toAuthResponse(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    },
    {
      id: user.organization.id,
      name: user.organization.name
    }
  );
};
