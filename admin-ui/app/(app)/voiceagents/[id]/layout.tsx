"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { ReactNode } from "react";
import { useSession } from "next-auth/react";

// Define which roles can see each tab
// ADMIN can see all tabs, USER can only see specific tabs
const allTabs = [
  { segment: "/analytics", label: "Analytics", roles: ["ADMIN", "USER"] },
  { segment: "", label: "Overview", roles: ["ADMIN"] },
  { segment: "/callflow", label: "Call Flow", roles: ["ADMIN"] },
  { segment: "/guardrails", label: "Guardrails", roles: ["ADMIN", "USER"] },
  { segment: "/voice", label: "Voice", roles: ["ADMIN"] },
  { segment: "/telephony", label: "Telephony", roles: ["ADMIN"] },
  { segment: "/acengage", label: "Acengage", roles: ["ADMIN", "USER"] },
  { segment: "/callouts", label: "Callouts", roles: ["ADMIN", "USER"] },
  { segment: "/feedback", label: "Feedback", roles: ["ADMIN", "USER"] },
  { segment: "/usage", label: "Usage", roles: ["ADMIN"] },
];

export default function VoiceAgentLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const { data: session } = useSession();
  const base = `/voiceagents/${params.id}`;

  const userRole = (session?.user?.role || "USER") as string;

  // Filter tabs based on user role
  const tabs = allTabs.filter((tab) => tab.roles.includes(userRole));

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
