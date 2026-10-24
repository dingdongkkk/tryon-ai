import { NextResponse, type NextRequest } from "next/server";

// Basic auth for the human-in-the-loop console and every /api/ops route. Always on:
// without CONSOLE_PASSWORD the console stays locked.

function constantTimeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function proxy(req: NextRequest) {
  const password = process.env.CONSOLE_PASSWORD;
  const user = process.env.CONSOLE_USER || "admin";
  if (!password || password.length < 8) {
    return new NextResponse("Console locked: set CONSOLE_PASSWORD (8+ characters) in .env.local", { status: 503 });
  }
  const [scheme, encoded] = (req.headers.get("authorization") ?? "").split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const i = decoded.indexOf(":");
      if (constantTimeEqual(decoded.slice(0, i), user) && constantTimeEqual(decoded.slice(i + 1), password)) return NextResponse.next();
    } catch {
      /* malformed header */
    }
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="TryOn AI console"' } });
}

export const config = {
  matcher: ["/console", "/console/:path*", "/api/ops/:path*"],
};
