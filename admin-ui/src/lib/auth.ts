import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/src/lib/prisma";

function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  // NOTE: NextAuth middleware runs on the Edge runtime and can’t validate DB sessions.
  // Use JWT sessions so middleware can authenticate requests and avoid redirect loops.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    GoogleProvider({
      clientId: mustGetEnv("GOOGLE_CLIENT_ID"),
      clientSecret: mustGetEnv("GOOGLE_CLIENT_SECRET")
    })
  ]
};


