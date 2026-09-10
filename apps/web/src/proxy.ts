import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutePattern =
  /^\/(?:import|profile|sections|dashboard|requests|matches|settings)(?:\/.*)?$/;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!protectedRoutePattern.test(pathname)) {
    return NextResponse.next();
  }

  // Fail closed: any error parsing the session token (e.g. a malformed
  // Authorization header) is treated as unauthenticated rather than surfacing
  // as a 500 on every protected route.
  let token: Awaited<ReturnType<typeof getToken>> = null;

  try {
    token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      // On HTTPS (all Vercel deployments) Auth.js v5 stores the session in a
      // `__Secure-authjs.session-token` cookie. getToken must be told to read the
      // secure cookie (and matching salt) or it decodes nothing and every
      // protected route redirects to /auth/signin.
      secureCookie: usesSecureCookies(request),
    });
  } catch {
    token = null;
  }

  if (token?.id) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/auth/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);

  return NextResponse.redirect(signInUrl);
}

/**
 * Whether Auth.js will have written the `__Secure-`-prefixed session cookie.
 *
 * This must be derived from the request scheme, NOT from NODE_ENV. Auth.js decides
 * from the resolved request URL, and `next start` sets NODE_ENV=production while still
 * serving plain http:// — so keying off NODE_ENV made the middleware look for
 * `__Secure-authjs.session-token` when Auth.js had actually written the unprefixed
 * `authjs.session-token`. Every protected route then redirected to sign-in forever.
 * Vercel was unaffected only because production and HTTPS happen to coincide there;
 * any HTTP deployment (self-hosted, or a container behind a TLS-terminating load
 * balancer) had login completely broken.
 *
 * `x-forwarded-proto` carries the original scheme when TLS is terminated upstream.
 * Trusting it here is safe: it selects which cookie NAME to read, never whether the
 * token is valid, so spoofing it in either direction just means no session is found
 * and the request is treated as unauthenticated — it fails closed.
 */
function usesSecureCookies(request: NextRequest) {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export const config = {
  matcher: [
    "/import/:path*",
    "/profile/:path*",
    "/sections/:path*",
    "/dashboard/:path*",
    "/requests/:path*",
    "/matches/:path*",
    "/settings/:path*",
  ],
};
