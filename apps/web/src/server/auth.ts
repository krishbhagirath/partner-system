import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

export class AuthenticationError extends Error {
  constructor() {
    super("You must sign in to continue.");
    this.name = "AuthenticationError";
  }
}

export async function requireUser() {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.email) {
    throw new AuthenticationError();
  }

  return {
    email: user.email,
    id: user.id,
    image: user.image ?? null,
    name: user.name ?? user.email,
  };
}

export async function requirePageUser() {
  const session = await auth();
  const user = session?.user;

  if (!user?.id || !user.email) {
    redirect("/auth/signin");
  }

  return {
    email: user.email,
    id: user.id,
    image: user.image ?? null,
    name: user.name ?? user.email,
  };
}
