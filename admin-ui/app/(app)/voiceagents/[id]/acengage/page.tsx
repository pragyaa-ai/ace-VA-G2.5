"use client";

import { useEffect, useMemo, useState } from "react";
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

type Employee = Record<string, unknown>;

type SavedEmployee = {
  jobId: string;
  employeeExternalId: string | null;
  employeeName: string | null;
  employeePhone: string | null;
  employeeCompany: string | null;
  isNew: boolean;
};

type PullResult = {
  employees: Employee[];
  statusTree?: unknown;
  count: number;
  savedCount: number;
  newCount: number;
  updatedCount: number;
  jobIds: string[];
  savedEmployees: SavedEmployee[];
  pulledAt: string;
  triggerResult?: {
    triggered: number;
    failed: number;
    skipped: number;
  };
};

// Get display-friendly field names
const FIELD_DISPLAY_NAMES: Record<string, string> = {
  id: "ID",
  employee_id: "Employee ID",
  name: "Name",
  employee_name: "Employee Name",
  full_name: "Full Name",
  phone: "Phone",
  phone_number: "Phone Number",
  mobile: "Mobile",
  company: "Company",
  company_name: "Company Name",
  organization: "Organization",
  email: "Email",
  department: "Department",
  designation: "Designation",
  status: "Status",
  created_at: "Created At",
  updated_at: "Updated At",
};

const getFieldDisplayName = (field: string): string => {
  return (
    FIELD_DISPLAY_NAMES[field] ||
    field
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (l) => l.toUpperCase())
  );
};

// Toggle Switch Component
const ToggleSwitch = ({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}) => (
  <label className="flex items-center gap-3 cursor-pointer">
    <div className="relative">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`w-11 h-6 rounded-full transition-colors ${
          enabled ? "bg-indigo-600" : "bg-slate-300"
        }`}
      />
      <div
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </div>
    <span className="text-sm font-medium text-slate-700">{label}</span>
  </label>
);

export default function AcengageCalloutsPage() {
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggeringCallouts, setTriggeringCallouts] = useState(false);
  const [triggeringJobId, setTriggeringJobId] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<CalloutScheduleConfig>(DEFAULT_CALLOUT_SCHEDULE);
  const [config, setConfig] = useState<AcengageConfig>(DEFAULT_ACENGAGE_CONFIG);
  const [statusTree, setStatusTree] = useState<unknown | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);
  const [pullError, setPullError] = useState<string>("");
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [testResult, setTestResult] = useState<string>("");
  const [autoTriggerCallouts, setAutoTriggerCallouts] = useState(false);
  const [triggeredJobIds, setTriggeredJobIds] = useState<Set<string>>(new Set());

  // Detect available fields from employee data
  const availableFields = useMemo(() => {
    if (employees.length === 0) return [];
    const fieldSet = new Set<string>();
    employees.forEach((emp) => {
      Object.keys(emp).forEach((key) => {
        if (emp[key] !== null && emp[key] !== undefined && emp[key] !== "") {
          fieldSet.add(key);
        }
      });
    });
    // Prioritize important fields
    const priority = ["id", "name", "employee_name", "phone_number", "phone", "mobile", "company", "company_name", "email", "department"];
    const sorted = Array.from(fieldSet).sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
      if (aIdx >= 0) return -1;
      if (bIdx >= 0) return 1;
      return a.localeCompare(b);
    });
    return sorted.slice(0, 7); // Show max 7 columns to leave room for actions
  }, [employees]);

  // Map employee to saved job
  const employeeJobMap = useMemo(() => {
    const map = new Map<number, SavedEmployee>();
    if (pullResult?.savedEmployees) {
      pullResult.savedEmployees.forEach((saved, idx) => {
        map.set(idx, saved);
      });
    }
    return map;
  }, [pullResult]);

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
    setPullResult(null);
    setPullError("");
    setEmployees([]);
    setTriggeredJobIds(new Set());
    try {
      const triggerParam = autoTriggerCallouts ? "?autoTrigger=true" : "";
      const res = await fetch(`/api/voiceagents/${params.id}/callouts/pull${triggerParam}`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setEmployees(data.employees || []);
        setPullResult(data as PullResult);
        if (data.statusTree) {
          setStatusTree(data.statusTree);
        }
        // If auto-trigger was on, mark all as triggered
        if (autoTriggerCallouts && data.jobIds) {
          setTriggeredJobIds(new Set(data.jobIds));
        }
      } else {
        setPullError(data.error || "Failed to pull data");
      }
    } catch (err) {
      setPullError(err instanceof Error ? err.message : "Unknown error");
    }
    setPulling(false);
  };

  const handleTriggerAllCallouts = async () => {
    if (!pullResult?.jobIds?.length) return;
    setTriggeringCallouts(true);
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/callouts/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: pullResult.jobIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggeredJobIds(new Set(pullResult.jobIds));
        alert(`Callouts triggered: ${data.triggered} calls queued, ${data.failed} failed, ${data.skipped} skipped`);
      } else {
        alert(`Error: ${data.error || "Failed to trigger callouts"}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setTriggeringCallouts(false);
  };

  const handleTriggerSingleCallout = async (jobId: string) => {
    setTriggeringJobId(jobId);
    try {
      const res = await fetch(`/api/voiceagents/${params.id}/callouts/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: [jobId] }),
      });
      const data = await res.json();
      if (res.ok) {
        setTriggeredJobIds((prev) => new Set([...prev, jobId]));
        if (data.triggered > 0) {
          // Success - no alert needed, UI updates
        } else if (data.skipped > 0) {
          alert("Call skipped - may have already been attempted today");
        } else {
          alert("Failed to trigger call");
        }
      } else {
        alert(`Error: ${data.error || "Failed to trigger call"}`);
      }
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setTriggeringJobId(null);
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

  const getFieldValue = (emp: Employee, field: string): string => {
    const value = emp[field];
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  const getEmployeeId = (emp: Employee): string | null => {
    return (
      getFieldValue(emp, config.employeeIdField) ||
      getFieldValue(emp, "id") ||
      getFieldValue(emp, "employee_id")
    );
  };

  // Find jobId for an employee by matching employeeExternalId
  const getJobIdForEmployee = (emp: Employee, idx: number): string | null => {
    const empId = getEmployeeId(emp);
    if (!empId || empId === "—") return null;
    
    // Try to find by index first (most reliable after fresh pull)
    const saved = employeeJobMap.get(idx);
    if (saved && saved.employeeExternalId === empId) {
      return saved.jobId;
    }
    
    // Fallback: search all saved employees
    const found = pullResult?.savedEmployees?.find(
      (s) => s.employeeExternalId === empId
    );
    return found?.jobId ?? null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  const allTriggered = pullResult?.jobIds?.every((id) => triggeredJobIds.has(id)) ?? false;
  const pendingCount = (pullResult?.jobIds?.length ?? 0) - triggeredJobIds.size;

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
        <div className="border-b border-sky-100 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Pull Employee Data</h3>
              <p className="text-sm text-slate-500">
                Fetch NC employees from Acengage API and save to database.
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
        </div>

        {/* Auto-trigger toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 py-2 px-4 bg-white/50 rounded-lg border border-sky-100">
          <ToggleSwitch
            enabled={autoTriggerCallouts}
            onChange={setAutoTriggerCallouts}
            label="Auto-trigger callouts after pull"
          />
          {!autoTriggerCallouts && pullResult && !allTriggered && pendingCount > 0 && (
            <Button
              onClick={handleTriggerAllCallouts}
              disabled={triggeringCallouts}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {triggeringCallouts ? "Starting..." : `Start All Callouts (${pendingCount})`}
            </Button>
          )}
          {allTriggered && pullResult && pullResult.jobIds.length > 0 && (
            <span className="text-sm text-emerald-600 font-medium">
              ✓ All callouts triggered
            </span>
          )}
        </div>

        {pullError && (
          <p className="text-sm text-red-600">Error: {pullError}</p>
        )}

        {pullResult && (
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-full">
              {pullResult.count} fetched
            </span>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">
              {pullResult.newCount} new
            </span>
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full">
              {pullResult.updatedCount} updated
            </span>
            {triggeredJobIds.size > 0 && (
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                {triggeredJobIds.size} calls triggered
              </span>
            )}
            {pullResult.triggerResult && pullResult.triggerResult.failed > 0 && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full">
                {pullResult.triggerResult.failed} failed
              </span>
            )}
          </div>
        )}

        {employees.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {availableFields.map((field) => (
                      <th
                        key={field}
                        className="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap"
                      >
                        {getFieldDisplayName(field)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.slice(0, 20).map((emp, idx) => {
                    const jobId = getJobIdForEmployee(emp, idx);
                    const isTriggered = jobId ? triggeredJobIds.has(jobId) : false;
                    const isCurrentlyTriggering = triggeringJobId === jobId;

                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        {availableFields.map((field) => (
                          <td
                            key={field}
                            className="px-3 py-2 text-slate-700 max-w-[180px] truncate"
                            title={getFieldValue(emp, field)}
                          >
                            {getFieldValue(emp, field)}
                          </td>
                        ))}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {!autoTriggerCallouts && jobId && !isTriggered && (
                              <button
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                                  isCurrentlyTriggering
                                    ? "bg-slate-100 text-slate-400 cursor-wait"
                                    : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                                }`}
                                onClick={() => handleTriggerSingleCallout(jobId)}
                                disabled={isCurrentlyTriggering}
                              >
                                {isCurrentlyTriggering ? "..." : "Call"}
                              </button>
                            )}
                            {isTriggered && (
                              <span className="px-2.5 py-1 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                                ✓ Triggered
                              </span>
                            )}
                            <button
                              className="text-xs text-slate-500 hover:text-emerald-600 hover:underline whitespace-nowrap"
                              onClick={() => {
                                const phone =
                                  getFieldValue(emp, config.phoneField) ||
                                  getFieldValue(emp, "phone_number") ||
                                  getFieldValue(emp, "phone") ||
                                  getFieldValue(emp, "mobile");
                                if (phone && phone !== "—") {
                                  setTestPhoneNumber(phone);
                                }
                              }}
                            >
                              Test
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {employees.length > 20 && (
              <p className="text-xs text-slate-400">
                Showing first 20 of {employees.length} employees.
              </p>
            )}
          </>
        )}
      </Card>

      {/* Schedule Section */}
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Automated Schedule</h3>
          <p className="text-sm text-slate-500">
            Configure when the system automatically pulls data and triggers callouts.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ToggleSwitch
              enabled={schedule.isActive}
              onChange={(enabled) => setSchedule({ ...schedule, isActive: enabled })}
              label="Enable automatic daily callouts"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Run Time (HH:mm)
            </label>
            <Input
              value={schedule.runAtLocalTime}
              onChange={(e) => setSchedule({ ...schedule, runAtLocalTime: e.target.value })}
              placeholder="11:00"
              disabled={!schedule.isActive}
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
              disabled={!schedule.isActive}
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
              disabled={!schedule.isActive}
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
              disabled={!schedule.isActive}
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
              className="rounded"
              disabled={!schedule.isActive}
            />
            <label
              htmlFor="escalationEnabled"
              className={`text-sm ${schedule.isActive ? "text-slate-700" : "text-slate-400"}`}
            >
              Escalate after max attempts
            </label>
          </div>
        </div>
      </Card>

      {/* Acengage API Section */}
      <Card className="p-6 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h3 className="text-base font-semibold text-slate-900">Acengage API & Field Mapping</h3>
          <p className="text-sm text-slate-500">
            Configure API endpoints and map fields from the Acengage response.
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Name Field
            </label>
            <Input
              value={config.nameField}
              onChange={(e) => setConfig({ ...config, nameField: e.target.value })}
              placeholder="name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Company Field
            </label>
            <Input
              value={config.companyField}
              onChange={(e) => setConfig({ ...config, companyField: e.target.value })}
              placeholder="company"
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
        <pre className="text-xs text-slate-600 whitespace-pre-wrap max-h-64 overflow-y-auto bg-slate-50 p-3 rounded-lg">
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
