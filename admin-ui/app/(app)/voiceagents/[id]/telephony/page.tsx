"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

// Elision telephony configuration defaults
const DEFAULT_CONFIG = {
  provider: "ELISION",
  wsUrl: "ws://0.0.0.0:8083/wsAcengage",
  sampleRateInput: 8000,
  sampleRateOutput: 8000,
  audioFormat: "PCM_INT16",
  bufferSizeMs: 200,
  connectionTimeoutMs: 30000,
  reconnectAttempts: 3,
  reconnectDelayMs: 1000,
  authUrl: "https://webrtc.elisiontec.com/api/login",
  addLeadUrl: "https://webrtc.elisiontec.com/api/add-lead",
  username: "ACESUP",
  password: "",
  listId: "250707112431",
  source: "Bot",
  addToHopper: "Y",
  commentsTemplate: "wss://acengageva.pragyaa.ai/wsAcengage?phone=elision",
  accessToken: "",
};

interface TelephonyConfig {
  provider: string;
  wsUrl: string;
  sampleRateInput: number;
  sampleRateOutput: number;
  audioFormat: string;
  bufferSizeMs: number;
  connectionTimeoutMs: number;
  reconnectAttempts: number;
  reconnectDelayMs: number;
  authUrl: string;
  addLeadUrl: string;
  username: string;
  password: string;
  listId: string;
  source: string;
  addToHopper: string;
  commentsTemplate: string;
  accessToken: string;
}

export default function TelephonyPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<TelephonyConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    // Load telephony config from voiceAgent's settingsJson or use defaults
    fetch(`/api/voiceagents/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.voiceProfile?.settingsJson?.telephony) {
          setConfig({ ...DEFAULT_CONFIG, ...data.voiceProfile.settingsJson.telephony });
        }
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    // Save telephony config to voice profile's settingsJson
    const res = await fetch(`/api/voiceagents/${params.id}/voice`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voiceName: "Waybeo",
        accentNotes: "Telephony configuration",
        settingsJson: { telephony: config },
      }),
    });
    setSaving(false);
    if (res.ok) {
      alert("Telephony configuration saved!");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Provider Info */}
      <Card className="p-6 bg-gradient-to-br from-sky-50 to-white border-sky-100">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Elision Telephony</h2>
            <p className="text-sm text-slate-500 mt-1">
              Current telephony provider for outbound callouts. Elision uses login + add-lead APIs and
              connects callers to the WebSocket endpoint for audio streaming.
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        </div>
      </Card>

      {/* Connection Settings */}
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Connection Settings</h3>
          <p className="text-sm text-slate-500">WebSocket endpoint and connection parameters</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">WebSocket URL</label>
            <Input
              value={config.wsUrl}
              onChange={(e) => setConfig({ ...config, wsUrl: e.target.value })}
              placeholder="ws://0.0.0.0:8083/wsAcengage"
            />
            <p className="mt-1 text-xs text-slate-400">
              Format: ws://host:port/path (e.g. ws://0.0.0.0:8083/wsAcengage for test, ws://0.0.0.0:8082/ws for prod)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Connection Timeout (ms)</label>
            <Input
              type="number"
              value={config.connectionTimeoutMs}
              onChange={(e) => setConfig({ ...config, connectionTimeoutMs: parseInt(e.target.value) || 30000 })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Reconnect Attempts</label>
            <Input
              type="number"
              value={config.reconnectAttempts}
              onChange={(e) => setConfig({ ...config, reconnectAttempts: parseInt(e.target.value) || 3 })}
            />
          </div>
        </div>
      </Card>

      {/* Audio Settings */}
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Audio Settings</h3>
          <p className="text-sm text-slate-500">Sample rates and buffer configuration for Elision streams</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Input Sample Rate (Hz)</label>
            <Input
              type="number"
              value={config.sampleRateInput}
              onChange={(e) => setConfig({ ...config, sampleRateInput: parseInt(e.target.value) || 8000 })}
            />
            <p className="mt-1 text-xs text-slate-400">Elision sends 8000 Hz</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Output Sample Rate (Hz)</label>
            <Input
              type="number"
              value={config.sampleRateOutput}
              onChange={(e) => setConfig({ ...config, sampleRateOutput: parseInt(e.target.value) || 8000 })}
            />
            <p className="mt-1 text-xs text-slate-400">Elision expects 8000 Hz</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Audio Format</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              value={config.audioFormat}
              onChange={(e) => setConfig({ ...config, audioFormat: e.target.value })}
            >
              <option value="PCM_INT16">PCM Int16</option>
              <option value="PCM_FLOAT32">PCM Float32</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Buffer Size (ms)</label>
            <Input
              type="number"
              value={config.bufferSizeMs}
              onChange={(e) => setConfig({ ...config, bufferSizeMs: parseInt(e.target.value) || 200 })}
            />
            <p className="mt-1 text-xs text-slate-400">Jitter buffer</p>
          </div>
        </div>
      </Card>

      {/* Elision Callout Settings */}
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Elision Callout Settings</h3>
          <p className="text-sm text-slate-500">
            These values are used to authenticate and trigger outbound callouts.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Auth URL</label>
            <Input
              value={config.authUrl}
              onChange={(e) => setConfig({ ...config, authUrl: e.target.value })}
              placeholder="https://webrtc.elisiontec.com/api/login"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Add Lead URL</label>
            <Input
              value={config.addLeadUrl}
              onChange={(e) => setConfig({ ...config, addLeadUrl: e.target.value })}
              placeholder="https://webrtc.elisiontec.com/api/add-lead"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Username</label>
            <Input
              value={config.username}
              onChange={(e) => setConfig({ ...config, username: e.target.value })}
              placeholder="ACESUP"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
            <Input
              type="password"
              value={config.password}
              onChange={(e) => setConfig({ ...config, password: e.target.value })}
              placeholder="Enter password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">List ID</label>
            <Input
              value={config.listId}
              onChange={(e) => setConfig({ ...config, listId: e.target.value })}
              placeholder="250707112431"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Source</label>
            <Input
              value={config.source}
              onChange={(e) => setConfig({ ...config, source: e.target.value })}
              placeholder="Bot"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Add To Hopper</label>
            <Input
              value={config.addToHopper}
              onChange={(e) => setConfig({ ...config, addToHopper: e.target.value })}
              placeholder="Y"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Comments / WS URL</label>
            <Input
              value={config.commentsTemplate}
              onChange={(e) => setConfig({ ...config, commentsTemplate: e.target.value })}
              placeholder="wss://acengageva.pragyaa.ai/wsAcengage?phone=elision"
            />
            <p className="mt-1 text-xs text-slate-400">
              This value is sent to Elision as the comments field and should include the WebSocket URL.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Access Token</label>
            <Input
              value={config.accessToken}
              onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
              placeholder="Paste token from login response"
            />
            <p className="mt-1 text-xs text-slate-400">
              Tokens are short-lived. Regenerate via the login API when needed.
            </p>
          </div>
        </div>
      </Card>

      {/* Info Box */}
      <Card className="p-5 bg-amber-50 border-amber-100">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-sm text-amber-800">
            <p className="font-medium">Important</p>
            <p className="mt-1">
              Changes to telephony settings require restarting the telephony service on the server.
              Contact your admin to apply changes after saving.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Telephony Config"}
        </Button>
      </div>
    </div>
  );
}



