"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { ReactNode } from "react";
import { useSession } from "next-auth/react";

const allTabs = [
  { segment: "/analytics", label: "Analytics", adminOnly: false },
  { segment: "", label: "Overview", adminOnly: false },
  { segment: "/callflow", label: "Call Flow", adminOnly: false },
  { segment: "/guardrails", label: "Guardrails", adminOnly: false },
  { segment: "/voice", label: "Voice", adminOnly: false },
  { segment: "/telephony", label: "Telephony", adminOnly: true },
  { segment: "/acengage", label: "Acengage", adminOnly: false },
  { segment: "/callouts", label: "Callouts", adminOnly: false },
  { segment: "/feedback", label: "Feedback", adminOnly: false },
  { segment: "/usage", label: "Usage", adminOnly: false },
];

export default function VoiceAgentLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();
  const base = `/voiceagents/${params.id}`;

  const userRole = session?.user?.role || "USER";
  const isAdmin = userRole === "ADMIN";

  // Filter tabs based on user role
  const tabs = allTabs.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/voiceagents" className="hover:underline">
          VoiceAgents
        </Link>
        <span>/</span>
        <span className="text-slate-700">Details</span>
      </div>

      <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((tab) => {
          const href = base + tab.segment;
          const active =
            tab.segment === ""
              ? pathname === base
              : pathname.startsWith(base + tab.segment);
          return (
            <Link
              key={tab.segment}
              href={href}
              className={
                "px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition " +
                (active
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
