"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-6">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">VoiceAgent Admin</div>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Use Google to access call flows, guardrails, voice settings, and usage analytics.
        </p>

        <div className="mt-6">
          <Button className="w-full" onClick={() => signIn("google", { callbackUrl: "/" })}>
            Continue with Google
          </Button>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          If you get redirected back here, verify Google OAuth redirect URI:
          <span className="ml-1 font-mono">
            /api/auth/callback/google
          </span>
        </p>
      </div>
    </main>
  );
}




