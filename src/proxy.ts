import { NextResponse, type NextRequest } from "next/server";

// Basic auth for the human-in-the-loop console and its APIs.
export function proxy(req: NextRequest) {
  const password = process.env.CONSOLE_PASSWORD;
  const user = process.env.CONSOLE_USER || "admin";
  if (!password) {
    if (process.env.NODE_ENV === "production") return new NextResponse("Set CONSOLE_PASSWORD", { status: 503 });
    return NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === password) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Wearable console"' },
  });
}

export const config = {
  matcher: ["/console/:path*", "/api/approvals/:path*", "/api/agenticorg/:path*"],
};
