import Link from "next/link";
import { SidebarNav } from "@/components/SidebarNav";
import { Topbar } from "@/components/Topbar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <Link href="/" className="block rounded-xl px-2 py-2 hover:bg-slate-50">
              <div className="text-sm font-semibold text-slate-900">VoiceAgent Admin</div>
              <div className="text-xs text-slate-500">Configuration & analytics</div>
            </Link>
            <div className="mt-4">
              <SidebarNav />
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              Tip: Configure per campaign to select the VoiceAgent engine and customize call flows.
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <Topbar />
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}


