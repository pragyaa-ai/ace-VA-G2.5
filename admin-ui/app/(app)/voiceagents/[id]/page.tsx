"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
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
  updatedAt: string;
  _count?: { sessions: number; feedback: number };
}

export default function VoiceAgentOverviewPage() {
  const params = useParams();
  const [agent, setAgent] = useState<VoiceAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phoneNumber: "",
    greeting: "",
    accent: "INDIAN" as keyof typeof ACCENTS,
    language: "ENGLISH" as keyof typeof LANGUAGES,
    voiceName: "ANANYA" as keyof typeof VOICE_NAMES,
    engine: "PRIMARY" as keyof typeof ENGINE_LABELS,
    isActive: true,
  });

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        setAgent(data);
        setForm({
          name: data.name,
          phoneNumber: data.phoneNumber || "",
          greeting: data.greeting,
          accent: data.accent,
          language: data.language,
          voiceName: data.voiceName,
          engine: data.engine,
          isActive: data.isActive,
        });
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/voiceagents/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      setAgent(updated);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }
  if (!agent) return <p className="text-red-500">VoiceAgent not found</p>;

  return (
    <div className="space-y-6">
      {/* Stats Row - Top */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Calls</p>
              <p className="text-2xl font-bold text-slate-900">{agent._count?.sessions ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Feedback</p>
              <p className="text-2xl font-bold text-slate-900">{agent._count?.feedback ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Voice</p>
              <p className="text-lg font-semibold text-slate-900">{VOICE_NAMES[agent.voiceName]}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-gradient-to-br from-violet-50 to-white border-violet-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</p>
              <p className={`text-lg font-semibold ${agent.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                {agent.isActive ? "Active" : "Inactive"}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Configuration Card */}
      <Card className="p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Configuration</h2>
            <p className="text-sm text-slate-500">Core settings for this VoiceAgent</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            agent.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${agent.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
            {agent.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Name
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Kia VoiceAgent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Inbound Phone Number
            </label>
            <Input
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+91 9876543210"
            />
            <p className="mt-1 text-xs text-slate-400">
              The phone number callers dial to reach this VoiceAgent
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Greeting Message
          </label>
          <Textarea
            value={form.greeting}
            onChange={(e) => setForm({ ...form, greeting: e.target.value })}
            rows={3}
            placeholder="Hello! Welcome to..."
          />
          <p className="mt-1 text-xs text-slate-400">
            The first message spoken when a call connects
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Voice</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={form.voiceName}
              onChange={(e) => setForm({ ...form, voiceName: e.target.value as keyof typeof VOICE_NAMES })}
            >
              {Object.entries(VOICE_NAMES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Accent</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={form.accent}
              onChange={(e) => setForm({ ...form, accent: e.target.value as keyof typeof ACCENTS })}
            >
              {Object.entries(ACCENTS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Language</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value as keyof typeof LANGUAGES })}
            >
              {Object.entries(LANGUAGES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Engine</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={form.engine}
              onChange={(e) => setForm({ ...form, engine: e.target.value as keyof typeof ENGINE_LABELS })}
            >
              {Object.entries(ENGINE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="isActive"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="isActive" className="text-sm text-slate-700">
            VoiceAgent is active and accepting calls
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-5">
          <p className="text-xs text-slate-400">
            Created {new Date(agent.createdAt).toLocaleDateString()} · Last updated {new Date(agent.updatedAt).toLocaleDateString()}
          </p>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
