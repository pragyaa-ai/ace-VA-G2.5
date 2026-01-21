"use client";

import { useEffect, useMemo, useState } from "react";
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
  completedAt?: string;
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
  status: string;
  totalAttempts: number;
  lastAttemptAt?: string;
  employeeJson: Record<string, unknown>;
  attempts: CalloutAttempt[];
  outcome?: CalloutOutcome | null;
};

export default function CalloutsPage() {
  const params = useParams();
  const [jobs, setJobs] = useState<CalloutJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [statusNodeId, setStatusNodeId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/callouts/jobs?limit=200`)
      .then((r) => r.json())
      .then((data) => setJobs(data))
      .finally(() => setLoading(false));
  }, [params.id]);

  const filtered = useMemo(() => {
    if (statusFilter === "ALL") return jobs;
    return jobs.filter((job) => job.status === statusFilter);
  }, [jobs, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5 flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Callouts</h2>
          <p className="text-sm text-slate-500">
            Recent callout jobs with attempts and outcomes.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <span>Status:</span>
          <select
            className="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
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
      </Card>

      <Card className="p-5 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500 border-b">
            <tr>
              <th className="py-2 pr-4">Employee ID</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Attempts</th>
              <th className="py-2 pr-4">Last Attempt</th>
              <th className="py-2 pr-4">Outcome</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {filtered.length === 0 ? (
              <tr>
                <td className="py-4 text-slate-400" colSpan={5}>
                  No callouts found.
                </td>
              </tr>
            ) : (
              filtered.map((job) => (
                <tr key={job.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-4">{job.employeeExternalId ?? "Unknown"}</td>
                  <td className="py-2 pr-4">{job.status}</td>
                  <td className="py-2 pr-4">{job.totalAttempts}</td>
                  <td className="py-2 pr-4">
                    {job.lastAttemptAt ? new Date(job.lastAttemptAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {job.outcome?.callbackDate
                      ? `${job.outcome.callbackDate} ${job.outcome.callbackTime ?? ""}`.trim()
                      : job.outcome?.nonContactableStatusNodeId
                      ? `Status ${job.outcome.nonContactableStatusNodeId}`
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold text-slate-900 mb-3">Attempts</h3>
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">No attempts yet.</p>
        ) : (
          filtered.map((job) => (
            <div key={job.id} className="mb-4 last:mb-0">
              <div className="text-sm font-medium text-slate-800">
                {job.employeeExternalId ?? "Unknown"} ({job.status})
              </div>
              {job.attempts.length === 0 ? (
                <p className="text-xs text-slate-400">No attempts recorded.</p>
              ) : (
                <ul className="mt-1 text-xs text-slate-600">
                  {job.attempts.map((attempt) => (
                    <li key={attempt.id}>
                      Attempt {attempt.attemptNumber} • {attempt.status} • {attempt.localDate}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Update Outcome</h3>
          <p className="text-sm text-slate-500">
            Post call outcomes to Acengage for a selected job.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Job</label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.employeeExternalId ?? "Unknown"} ({job.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Callback Date
            </label>
            <Input
              value={callbackDate}
              onChange={(e) => setCallbackDate(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Callback Time
            </label>
            <Input
              value={callbackTime}
              onChange={(e) => setCallbackTime(e.target.value)}
              placeholder="HH:mm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Status Node ID
            </label>
            <Input
              value={statusNodeId}
              onChange={(e) => setStatusNodeId(e.target.value)}
              placeholder="718"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={async () => {
              if (!selectedJobId) return;
              setSaving(true);
              await fetch(
                `/api/voiceagents/${params.id}/callouts/jobs/${selectedJobId}/outcome`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    callbackDate: callbackDate || undefined,
                    callbackTime: callbackTime || undefined,
                    nonContactableStatusNodeId: statusNodeId
                      ? parseInt(statusNodeId, 10)
                      : undefined,
                    notes: notes || undefined,
                  }),
                }
              );
              setSaving(false);
            }}
            disabled={!selectedJobId || saving}
          >
            {saving ? "Saving..." : "Post Outcome"}
          </Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => window.location.reload()}>Refresh</Button>
      </div>
    </div>
  );
}
