"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export function Topbar() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">Admin Console</div>
        <div className="text-xs text-slate-500">
          Manage call flows, guardrails, voice, and usage.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sign out
        </Button>
      </div>
    </div>
  );
}




