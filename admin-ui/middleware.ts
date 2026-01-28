export { default } from "next-auth/middleware";

export const config = {
  // Exclude from auth:
  // - api/auth/* (NextAuth routes)
  // - api/voiceagents/*/callouts/complete (telephony webhook)
  // - login, static assets
  matcher: ["/((?!api/auth|api/voiceagents/[^/]+/callouts/complete|login|_next/static|_next/image|favicon.ico).*)"]
};




