"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
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

type Employee = {
  id: string;
  phone_number?: string;
  name?: string;
  [key: string]: unknown;
};

export default function AcengageCalloutsPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [schedule, setSchedule] = useState<CalloutScheduleConfig>(DEFAULT_CALLOUT_SCHEDULE);
  const [config, setConfig] = useState<AcengageConfig>(DEFAULT_ACENGAGE_CONFIG);
  const [statusTree, setStatusTree] = useState<unknown | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pullResult, setPullResult] = useState<string>("");
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [testResult, setTestResult] = useState<string>("");

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

  const handlePullData = async () => {
    setPulling(true);
    setPullResult("");
    setEmployees([]);
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/callouts/pull`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setEmployees(data.employees || []);
        setPullResult(`Pulled ${data.employees?.length || 0} employees successfully.`);
        if (data.statusTree) {
          setStatusTree(data.statusTree);
        }
      } else {
        setPullResult(`Error: ${data.error || "Failed to pull data"}`);
      }
    } catch (err) {
      setPullResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setPulling(false);
  };

  const handleTriggerTestCall = async () => {
    if (!testPhoneNumber.trim()) {
      alert("Please enter a phone number");
      return;
    }
    setTriggering(true);
    setTestResult("");
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/callouts/test-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: testPhoneNumber.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(`Test call triggered successfully!\n${JSON.stringify(data, null, 2)}`);
      } else {
        setTestResult(`Error: ${data.error || "Failed to trigger test call"}`);
      }
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setTriggering(false);
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
      {/* Test Call Section */}
      <Card className="p-6 space-y-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
        <div className="border-b border-emerald-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Test Call</h3>
          <p className="text-sm text-slate-500">
            Trigger a test call via Elision telephony to verify the setup.
          </p>
        </div>

        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Phone Number
            </label>
            <Input
              value={testPhoneNumber}
              onChange={(e) => setTestPhoneNumber(e.target.value)}
              placeholder="e.g. 9876543210"
            />
          </div>
          <Button
            onClick={handleTriggerTestCall}
            disabled={triggering}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {triggering ? "Calling..." : "Trigger Test Call"}
          </Button>
        </div>

        {testResult && (
          <pre className="text-xs p-3 bg-slate-50 rounded-lg whitespace-pre-wrap">
            {testResult}
          </pre>
        )}
      </Card>

      {/* Pull Data Section */}
      <Card className="p-6 space-y-5 bg-gradient-to-br from-sky-50 to-white border-sky-100">
        <div className="border-b border-sky-100 pb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Pull Employee Data</h3>
            <p className="text-sm text-slate-500">
              Fetch NC employees from Acengage API now.
            </p>
          </div>
          <Button
            onClick={handlePullData}
            disabled={pulling}
            className="bg-sky-600 hover:bg-sky-700"
          >
            {pulling ? "Pulling..." : "Pull Data Now"}
          </Button>
        </div>

        {pullResult && (
          <p className={`text-sm ${pullResult.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
            {pullResult}
          </p>
        )}

        {employees.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Phone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.slice(0, 10).map((emp, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-slate-700">{String(emp.id || emp[config.employeeIdField] || "-")}</td>
                    <td className="px-3 py-2 text-slate-700">{String(emp.name || emp.employee_name || "-")}</td>
                    <td className="px-3 py-2 text-slate-700">{String(emp.phone_number || emp[config.phoneField] || "-")}</td>
                    <td className="px-3 py-2">
                      <button
                        className="text-xs text-emerald-600 hover:underline"
                        onClick={() => {
                          const phone = String(emp.phone_number || emp[config.phoneField] || "");
                          if (phone) {
                            setTestPhoneNumber(phone);
                          }
                        }}
                      >
                        Use for Test
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length > 10 && (
              <p className="text-xs text-slate-400 mt-2">Showing first 10 of {employees.length} employees.</p>
            )}
          </div>
        )}
      </Card>

      {/* Schedule Section */}
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

      {/* Acengage API Section */}
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

      {/* Status Tree Section */}
      <Card className="p-6 space-y-3">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Status Tree</h3>
          <p className="text-sm text-slate-500">
            Latest status tree fetched from Acengage (read-only).
          </p>
        </div>
        <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-64 overflow-y-auto">
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
