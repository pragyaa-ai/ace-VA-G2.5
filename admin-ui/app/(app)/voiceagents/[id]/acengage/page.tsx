"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import {
  DEFAULT_ACENGAGE_CONFIG,
  DEFAULT_CALLOUT_SCHEDULE,
  AcengageConfig,
  CalloutScheduleConfig,
} from "@/lib/callouts";

type CalloutConfigResponse = {
  schedule: CalloutScheduleConfig;
  acengage: AcengageConfig & { statusTree?: unknown };
};

export default function AcengageCalloutsPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<CalloutScheduleConfig>(DEFAULT_CALLOUT_SCHEDULE);
  const [config, setConfig] = useState<AcengageConfig>(DEFAULT_ACENGAGE_CONFIG);
  const [statusTree, setStatusTree] = useState<unknown | null>(null);

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/callouts/config`)
      .then((r) => r.json())
      .then((data: CalloutConfigResponse) => {
        setSchedule({ ...DEFAULT_CALLOUT_SCHEDULE, ...data.schedule });
        const { statusTree: fetchedTree, ...acengageConfig } = data.acengage ?? {};
        setConfig({ ...DEFAULT_ACENGAGE_CONFIG, ...acengageConfig });
        setStatusTree(fetchedTree ?? null);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/voiceagents/${params.id}/callouts/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule, acengage: config }),
    });
    setSaving(false);
    if (res.ok) {
      alert("Acengage callout settings saved!");
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
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Schedule</h3>
          <p className="text-sm text-slate-500">
            Default schedule is 11:00 IST. Update as needed for callout runs.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="scheduleActive"
              type="checkbox"
              checked={schedule.isActive}
              onChange={(e) => setSchedule({ ...schedule, isActive: e.target.checked })}
            />
            <label htmlFor="scheduleActive" className="text-sm text-slate-700">
              Enable daily callouts
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Run Time (HH:mm)
            </label>
            <Input
              value={schedule.runAtLocalTime}
              onChange={(e) => setSchedule({ ...schedule, runAtLocalTime: e.target.value })}
              placeholder="11:00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Timezone
            </label>
            <Input
              value={schedule.timezone}
              onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })}
              placeholder="Asia/Kolkata"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Attempts Per Day
            </label>
            <Input
              type="number"
              value={schedule.attemptsPerDay}
              onChange={(e) =>
                setSchedule({
                  ...schedule,
                  attemptsPerDay: parseInt(e.target.value) || 3,
                })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Max Days
            </label>
            <Input
              type="number"
              value={schedule.maxDays}
              onChange={(e) =>
                setSchedule({ ...schedule, maxDays: parseInt(e.target.value) || 2 })
              }
            />
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="escalationEnabled"
              type="checkbox"
              checked={schedule.escalationEnabled}
              onChange={(e) =>
                setSchedule({ ...schedule, escalationEnabled: e.target.checked })
              }
            />
            <label htmlFor="escalationEnabled" className="text-sm text-slate-700">
              Escalate after max attempts
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Acengage API</h3>
          <p className="text-sm text-slate-500">
            Endpoints and field mapping for NC employee fetch and status update.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">GET URL</label>
            <Input
              value={config.getUrl}
              onChange={(e) => setConfig({ ...config, getUrl: e.target.value })}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              POST URL Template
            </label>
            <Input
              value={config.updateUrlTemplate}
              onChange={(e) => setConfig({ ...config, updateUrlTemplate: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-400">
              Use {"{employeeId}"} as a placeholder.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Employee ID Field
            </label>
            <Input
              value={config.employeeIdField}
              onChange={(e) => setConfig({ ...config, employeeIdField: e.target.value })}
              placeholder="id"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Phone Field
            </label>
            <Input
              value={config.phoneField}
              onChange={(e) => setConfig({ ...config, phoneField: e.target.value })}
              placeholder="phone_number"
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Status Tree</h3>
          <p className="text-sm text-slate-500">
            Latest status tree fetched from Acengage (read-only).
          </p>
        </div>
        <pre className="text-xs text-slate-600 whitespace-pre-wrap">
          {statusTree ? JSON.stringify(statusTree, null, 2) : "No status tree fetched yet."}
        </pre>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Acengage Settings"}
        </Button>
      </div>
    </div>
  );
}
