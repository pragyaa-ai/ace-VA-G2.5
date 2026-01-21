"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/voiceagents", label: "VoiceAgents" },
  { href: "/feedback", label: "Feedback" },
  { href: "/usage", label: "Usage" }
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "block rounded-xl px-3 py-2 text-sm transition " +
              (active
                ? "bg-indigo-50 text-indigo-700"
                : "text-slate-700 hover:bg-slate-50")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}


