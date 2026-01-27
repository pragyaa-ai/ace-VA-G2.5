"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type CalloutAttempt = {
  id: string;
  attemptNumber: number;
  status: string;
  localDate: string;
  requestedAt?: string;
  dialedAt?: string;
  answeredAt?: string;
  completedAt?: string;
  callDurationSec?: number;
  callSid?: string;
  errorMessage?: string;
};

type CalloutOutcome = {
  callbackDate?: string;
  callbackTime?: string;
  nonContactableStatusNodeId?: number;
  notes?: string;
};

type CalloutJob = {
  id: string;
  employeeExternalId?: string;
  employeeName?: string;
  employeePhone?: string;
  employeeCompany?: string;
  status: string;
  totalAttempts: number;
  lastAttemptAt?: string;
  pulledAt?: string;
  attempts: CalloutAttempt[];
  outcome?: CalloutOutcome | null;
};

type Summary = {
  totalJobs: number;
  pendingJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  escalatedJobs: number;
  pulledToday: number;
  activeAttempts: number;
  scheduledCallbacks: number;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ESCALATED: "bg-amber-100 text-amber-700",
  QUEUED: "bg-slate-100 text-slate-600",
  TRIGGERED: "bg-sky-100 text-sky-700",
  DIALING: "bg-indigo-100 text-indigo-700",
  RINGING: "bg-violet-100 text-violet-700",
  ANSWERED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  NO_ANSWER: "bg-orange-100 text-orange-700",
  BUSY: "bg-yellow-100 text-yellow-700",
  VOICEMAIL: "bg-purple-100 text-purple-700",
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatTime = (dateStr?: string): string => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (dateStr?: string): string => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function CalloutsPage() {
  const params = useParams();
  const [jobs, setJobs] = useState<CalloutJob[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Outcome form state
  const [selectedJobId, setSelectedJobId] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [statusNodeId, setStatusNodeId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const statusParam = statusFilter !== "ALL" ? `&status=${statusFilter}` : "";
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(
        `/api/voiceagents/${params.id}/callouts/jobs?limit=200&summary=true${statusParam}${searchParam}`
      );
      const data = await res.json();
      setJobs(data.jobs || []);
      setSummary(data.summary || null);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to fetch callouts:", err);
    } finally {
      setLoading(false);
    }
  }, [params.id, statusFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handleSaveOutcome = async () => {
    if (!selectedJobId) return;
    setSaving(true);
    try {
      await fetch(`/api/voiceagents/${params.id}/callouts/jobs/${selectedJobId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callbackDate: callbackDate || undefined,
          callbackTime: callbackTime || undefined,
          nonContactableStatusNodeId: statusNodeId ? parseInt(statusNodeId, 10) : undefined,
          notes: notes || undefined,
        }),
      });
      // Refresh data
      fetchData();
      // Reset form
      setCallbackDate("");
      setCallbackTime("");
      setStatusNodeId("");
      setNotes("");
    } finally {
      setSaving(false);
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
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-to-br from-sky-50 to-white border-sky-100">
            <div className="text-2xl font-bold text-sky-700">{summary.pulledToday}</div>
            <div className="text-xs text-slate-500">Pulled Today</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
            <div className="text-2xl font-bold text-indigo-700">{summary.activeAttempts}</div>
            <div className="text-xs text-slate-500">Calls Active</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
            <div className="text-2xl font-bold text-emerald-700">{summary.completedJobs}</div>
            <div className="text-xs text-slate-500">Completed</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
            <div className="text-2xl font-bold text-amber-700">{summary.scheduledCallbacks}</div>
            <div className="text-xs text-slate-500">Callbacks Scheduled</div>
          </Card>
        </div>
      )}

      {/* Filters and Controls */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Status:</span>
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="ESCALATED">Escalated</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search by name, phone, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh
            </label>
            <span className="text-xs text-slate-400">
              Last: {formatTime(lastRefresh.toISOString())}
            </span>
            <Button onClick={fetchData} className="text-sm px-3 py-1.5">
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Jobs Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Last Activity</th>
                <th className="px-4 py-3">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={7}>
                    No callout jobs found. Pull employee data from the Acengage tab to get started.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <>
                    <tr
                      key={job.id}
                      className={`hover:bg-slate-50 cursor-pointer ${
                        expandedJob === job.id ? "bg-slate-50" : ""
                      }`}
                      onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {job.employeeName || "Unknown"}
                        </div>
                        <div className="text-xs text-slate-400">{job.employeeExternalId}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {job.employeeCompany || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                        {job.employeePhone || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            STATUS_COLORS[job.status] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {job.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{job.totalAttempts}</span>
                          {job.attempts.length > 0 && (
                            <span className="text-xs text-slate-400">
                              ({job.attempts[0]?.status})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatDateTime(job.lastAttemptAt)}
                      </td>
                      <td className="px-4 py-3">
                        {job.outcome?.callbackDate ? (
                          <span className="text-emerald-600 text-xs">
                            📅 {job.outcome.callbackDate} {job.outcome.callbackTime || ""}
                          </span>
                        ) : job.outcome?.nonContactableStatusNodeId ? (
                          <span className="text-amber-600 text-xs">
                            Status #{job.outcome.nonContactableStatusNodeId}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded Row - Attempt Timeline */}
                    {expandedJob === job.id && job.attempts.length > 0 && (
                      <tr key={`${job.id}-expanded`}>
                        <td colSpan={7} className="px-4 py-3 bg-slate-50/50">
                          <div className="pl-4 border-l-2 border-slate-200 space-y-2">
                            <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                              Attempt Timeline
                            </div>
                            {job.attempts.map((attempt) => (
                              <div
                                key={attempt.id}
                                className="flex items-center gap-4 text-xs"
                              >
                                <span
                                  className={`inline-flex px-2 py-0.5 font-medium rounded ${
                                    STATUS_COLORS[attempt.status] || "bg-slate-100"
                                  }`}
                                >
                                  #{attempt.attemptNumber} {attempt.status}
                                </span>
                                <span className="text-slate-500">
                                  {attempt.localDate}
                                </span>
                                {attempt.requestedAt && (
                                  <span className="text-slate-400">
                                    Triggered: {formatTime(attempt.requestedAt)}
                                  </span>
                                )}
                                {attempt.dialedAt && (
                                  <span className="text-indigo-500">
                                    Dialed: {formatTime(attempt.dialedAt)}
                                  </span>
                                )}
                                {attempt.answeredAt && (
                                  <span className="text-emerald-500">
                                    Answered: {formatTime(attempt.answeredAt)}
                                  </span>
                                )}
                                {attempt.callDurationSec !== undefined &&
                                  attempt.callDurationSec !== null && (
                                    <span className="text-blue-500">
                                      Duration: {formatDuration(attempt.callDurationSec)}
                                    </span>
                                  )}
                                {attempt.errorMessage && (
                                  <span className="text-red-500 truncate max-w-[200px]">
                                    {attempt.errorMessage}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Stats Row */}
      {summary && (
        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
          <span>
            Total: <strong className="text-slate-700">{summary.totalJobs}</strong>
          </span>
          <span>
            Pending: <strong className="text-slate-700">{summary.pendingJobs}</strong>
          </span>
          <span>
            In Progress: <strong className="text-blue-600">{summary.inProgressJobs}</strong>
          </span>
          <span>
            Escalated: <strong className="text-amber-600">{summary.escalatedJobs}</strong>
          </span>
        </div>
      )}

      {/* Update Outcome Form */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Update Outcome</h3>
          <p className="text-sm text-slate-500">
            Manually record call outcomes and post to Acengage.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Job</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.employeeName || job.employeeExternalId || "Unknown"} - {job.employeePhone}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Callback Date
            </label>
            <Input
              type="date"
              value={callbackDate}
              onChange={(e) => setCallbackDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Callback Time
            </label>
            <Input
              type="time"
              value={callbackTime}
              onChange={(e) => setCallbackTime(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Status Node
            </label>
            <Input
              value={statusNodeId}
              onChange={(e) => setStatusNodeId(e.target.value)}
              placeholder="718"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes about the call outcome"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSaveOutcome} disabled={!selectedJobId || saving}>
            {saving ? "Saving..." : "Save Outcome"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
