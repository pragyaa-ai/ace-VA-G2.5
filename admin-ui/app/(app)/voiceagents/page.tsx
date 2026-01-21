"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { VOICE_NAMES, ACCENTS, LANGUAGES, ENGINE_LABELS } from "@/lib/validation";

interface VoiceAgent {
  id: string;
  name: string;
  phoneNumber?: string;
  engine: keyof typeof ENGINE_LABELS;
  greeting: string;
  accent: keyof typeof ACCENTS;
  language: keyof typeof LANGUAGES;
  voiceName: keyof typeof VOICE_NAMES;
  isActive: boolean;
  createdAt: string;
  _count?: { sessions: number; feedback: number; guardrails: number };
}

export default function VoiceAgentsPage() {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/voiceagents")
      .then((r) => r.json())
      .then(setAgents)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">VoiceAgents</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your AI-powered voice assistants
          </p>
        </div>
        <Link href="/voiceagents/new">
          <Button>
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New VoiceAgent
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-slate-400">Loading...</div>
        </div>
      ) : agents.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 mb-4">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No VoiceAgents yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Create your first VoiceAgent to get started</p>
          <Link href="/voiceagents/new">
            <Button>Create VoiceAgent</Button>
          </Link>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Link key={agent.id} href={`/voiceagents/${agent.id}`}>
              <Card className="p-5 h-full hover:shadow-lg hover:border-indigo-200 transition-all cursor-pointer group">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold text-sm shadow-sm">
                      {agent.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {agent.phoneNumber || "No phone assigned"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      agent.isActive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${agent.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {agent.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Voice & Accent */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="text-center p-2 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Voice</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">
                      {VOICE_NAMES[agent.voiceName]}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Accent</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">
                      {ACCENTS[agent.accent]}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-slate-50">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">Language</p>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">
                      {LANGUAGES[agent.language]}
                    </p>
                  </div>
                </div>

                {/* Stats Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {agent._count?.sessions ?? 0} calls
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {agent._count?.guardrails ?? 0} rules
                    </span>
                  </div>
                  <svg className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
