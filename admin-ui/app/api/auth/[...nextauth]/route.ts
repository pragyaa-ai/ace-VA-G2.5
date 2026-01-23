import NextAuth from "next-auth";
import { getAuthOptions } from "@/src/lib/auth";

const buildHandler = () => NextAuth(getAuthOptions());

export const GET = async (req: Request, ctx: unknown) => buildHandler()(req, ctx as never);
export const POST = async (req: Request, ctx: unknown) => buildHandler()(req, ctx as never);




