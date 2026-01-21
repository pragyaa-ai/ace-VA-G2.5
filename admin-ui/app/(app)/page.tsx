import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.05%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30" />
        <div className="relative">
          <h1 className="text-3xl font-bold">Welcome to VoiceAgent Admin</h1>
          <p className="mt-2 text-indigo-100 max-w-xl">
            Configure your AI voice assistants, manage call flows, set guardrails, and track performance.
          </p>
          <div className="mt-6 flex gap-3">
            <Link href="/voiceagents">
              <Button className="bg-white text-indigo-700 hover:bg-indigo-50">
                View VoiceAgents
              </Button>
            </Link>
            <Link href="/voiceagents/new">
              <Button className="bg-indigo-500 text-white hover:bg-indigo-400 border-indigo-400">
                + Create New
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">VoiceAgents</p>
              <p className="text-2xl font-bold text-slate-900">—</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Calls</p>
              <p className="text-2xl font-bold text-slate-900">—</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Feedback Items</p>
              <p className="text-2xl font-bold text-slate-900">—</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/voiceagents">
          <Card className="p-6 h-full hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                  VoiceAgents
                </h3>
                <p className="text-sm text-slate-500">
                  Configure greeting, voice, accent, and call flows
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/feedback">
          <Card className="p-6 h-full hover:shadow-lg hover:border-amber-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-amber-600 transition">
                  Feedback
                </h3>
                <p className="text-sm text-slate-500">
                  Review testing feedback and improve behavior
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/usage">
          <Card className="p-6 h-full hover:shadow-lg hover:border-emerald-200 transition-all cursor-pointer group">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 group-hover:text-emerald-600 transition">
                  Usage
                </h3>
                <p className="text-sm text-slate-500">
                  Track calls and minutes across all VoiceAgents
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Tip Card */}
      <Card className="p-5 bg-gradient-to-r from-slate-50 to-white border-slate-200">
        <div className="flex gap-4">
          <div className="flex-shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-slate-900">Getting Started</h4>
            <p className="text-sm text-slate-500 mt-1">
              Run <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-mono">npx prisma db seed</code> to 
              create the default "Kia VoiceAgent" with preconfigured settings, call flow, and guardrails.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
