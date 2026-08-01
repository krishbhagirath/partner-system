import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { z } from "zod";

import { db } from "@/lib/db";
import { EMAIL_VERIFICATION_ENABLED } from "@/lib/feature-flags";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// Thrown after a correct password on an unverified account. `code` (not
// `type`) is what next-auth's client `signIn()` surfaces to the caller, even
// with `redirect: false` — see the base CredentialsSignin class.
export class EmailNotVerifiedError extends CredentialsSignin {
  code = "EmailNotVerified";
}

const ALLOWED_EMAIL_DOMAIN = "@mcmaster.ca";

// Valid bcrypt hash of a throwaway string. Compared against when the email is
// unknown so lookup misses take as long as password mismatches, keeping
// response timing from revealing which emails have accounts.
const timingEqualizationHash = "$2b$12$CQZ7mjxKLwQYmJgFV4TFT.hV1/8L5zzec.qFthrXRHMDlBsW1E6IW";

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }

      return session;
    },
    signIn({ account, profile }) {
      // Only the OAuth provider needs a domain check; Credentials sign-in
      // already only matches users who registered with an @mcmaster.ca
      // email (enforced at registration).
      if (account?.provider !== "microsoft-entra-id") {
        return true;
      }

      const email = (profile?.email ?? profile?.preferred_username ?? "")
        .toString()
        .trim()
        .toLowerCase();

      return email.endsWith(ALLOWED_EMAIL_DOMAIN);
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    MicrosoftEntraID({
      // "organizations" accepts any work/school Microsoft account (not
      // personal outlook.com/hotmail.com accounts) without requiring
      // McMaster's own tenant to register or approve this app. The signIn
      // callback above is the actual gate restricting it to @mcmaster.ca.
      issuer: "https://login.microsoftonline.com/organizations/v2.0/",
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Safe here specifically because every sign-in is already gated to a
      // single verified domain (@mcmaster.ca) above; there's no risk of a
      // malicious provider vouching for an email it doesn't control.
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        const parsedCredentials = credentialsSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const user = await db.user.findUnique({
          where: {
            email: parsedCredentials.data.email.toLowerCase(),
          },
        });

        const isValidPassword = await bcrypt.compare(
          parsedCredentials.data.password,
          user?.passwordHash ?? timingEqualizationHash,
        );

        if (!user?.passwordHash || !isValidPassword) {
          return null;
        }

        // Gated by EMAIL_VERIFICATION_ENABLED (currently off — see feature-flags.ts).
        if (EMAIL_VERIFICATION_ENABLED && !user.emailVerified) {
          throw new EmailNotVerifiedError();
        }

        return {
          email: user.email,
          id: user.id,
          image: user.image,
          name: user.name ?? user.displayName ?? user.email,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  trustHost: true,
});
