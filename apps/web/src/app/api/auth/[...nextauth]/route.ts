import { handlers } from "@/auth";

export const runtime = "nodejs";

export function GET(request: Request) {
  return handlers.GET(request as never);
}

export function POST(request: Request) {
  return handlers.POST(request as never);
}
