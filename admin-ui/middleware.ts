export { default } from "next-auth/middleware";

export const config = {
  // Exclude from auth:
  // - api/auth/* (NextAuth routes)
  // - api/voiceagents/*/callouts/complete (telephony webhook)
  // - api/sessions (telephony call logging)
  // - login, static assets
  matcher: ["/((?!api/auth|api/voiceagents/[^/]+/callouts/complete|api/sessions|login|_next/static|_next/image|favicon.ico).*)"]
};




