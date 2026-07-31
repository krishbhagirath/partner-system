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
