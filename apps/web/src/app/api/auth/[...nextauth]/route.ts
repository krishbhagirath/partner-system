import { handlers } from "@/auth";
import {
  checkRateLimit,
  consumeRateLimit,
  getClientIp,
  peekRateLimit,
  rateLimitExceededResponse,
  rateLimitRules,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handlers.GET(request as never);
}

/**
 * Credentials sign-in is limited on two independent axes:
 *
 *   per IP       — coarse, and only as trustworthy as the host's forwarded headers.
 *   per account  — the one that actually stops credential stuffing, because it holds
 *                  even when an attacker rotates IPs (or spoofs a header we trust).
 *
 * The per-account budget is consumed only by FAILED attempts, so a legitimate user who
 * knows their password is never locked out of their own account by someone else
 * hammering it. That also means the limit cannot be turned into a denial-of-service
 * against a specific student.
 */
export async function POST(request: Request) {
  if (!isCredentialsSignIn(request)) {
    return handlers.POST(request as never);
  }

  const ipLimit = checkRateLimit(
    `auth-sign-in:${getClientIp(request)}`,
    rateLimitRules.authSignIn,
  );

  if (!ipLimit.ok) {
    return rateLimitExceededResponse(ipLimit.retryAfterSeconds);
  }

  // Read the body from a clone so the original stream stays intact for Auth.js.
  const email = await readEmail(request.clone());
  const accountKey = email ? `auth-sign-in-account:${email}` : null;

  if (accountKey) {
    const accountLimit = peekRateLimit(accountKey, rateLimitRules.authSignInAccount);

    if (!accountLimit.ok) {
      return rateLimitExceededResponse(accountLimit.retryAfterSeconds);
    }
  }

  const response = await handlers.POST(request as never);

  if (accountKey && isFailedSignIn(response)) {
    consumeRateLimit(accountKey, rateLimitRules.authSignInAccount);
  }

  return response;
}

function isCredentialsSignIn(request: Request) {
  return new URL(request.url).pathname.endsWith("/callback/credentials");
}

/**
 * Lower-cased so `Student@mcmaster.ca` and `student@mcmaster.ca` share one budget —
 * otherwise case variation alone would multiply the allowance.
 */
async function readEmail(request: Request): Promise<string | null> {
  try {
    const form = await request.formData();
    const email = form.get("email");

    return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Auth.js answers a credentials POST with a redirect. A rejected sign-in carries an
 * `error` query parameter (e.g. `?error=CredentialsSignin`); a successful one
 * redirects to the callback URL without it. Anything that is not a redirect at all is
 * treated as a failure so a broken response cannot hand out free attempts.
 */
function isFailedSignIn(response: Response) {
  const location = response.headers.get("location");

  if (!location) {
    return true;
  }

  try {
    return new URL(location, "http://localhost").searchParams.has("error");
  } catch {
    return true;
  }
}
