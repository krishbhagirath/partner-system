import { handlers } from "@/auth";
import { checkRateLimit, rateLimitExceededResponse, rateLimitRules } from "@/lib/rate-limit";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handlers.GET(request as never);
}

export function POST(request: Request) {
  if (isCredentialsSignIn(request)) {
    const rateLimit = checkRateLimit(
      `auth-sign-in:${getClientIp(request)}`,
      rateLimitRules.authSignIn,
    );

    if (!rateLimit.ok) {
      return rateLimitExceededResponse(rateLimit.retryAfterSeconds);
    }
  }

  return handlers.POST(request as never);
}

function isCredentialsSignIn(request: Request) {
  return new URL(request.url).pathname.endsWith("/callback/credentials");
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
