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
  outcome?: string;
  candidateConcerns?: string[];
  candidateQueries?: string[];
  sentiment?: string;
  cooperationLevel?: string;
  languagePreference?: string;
  languageIssues?: string;
  rescheduleRequested?: boolean;
  specialNotes?: string;
  postedAt?: string;
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

// Outcome display labels
const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "bg-emerald-100 text-emerald-700" },
  not_interested: { label: "Not Interested", color: "bg-red-100 text-red-700" },
  callback_requested: { label: "Callback Requested", color: "bg-blue-100 text-blue-700" },
  no_response: { label: "No Response", color: "bg-slate-100 text-slate-600" },
  disconnected: { label: "Disconnected", color: "bg-orange-100 text-orange-700" },
  busy: { label: "Busy", color: "bg-yellow-100 text-yellow-700" },
  wrong_number: { label: "Wrong Number", color: "bg-red-100 text-red-700" },
  language_barrier: { label: "Language Barrier", color: "bg-purple-100 text-purple-700" },
  voicemail: { label: "Voicemail", color: "bg-indigo-100 text-indigo-700" },
  incomplete: { label: "Incomplete", color: "bg-slate-100 text-slate-600" },
};

const SENTIMENT_LABELS: Record<string, { label: string; color: string }> = {
  positive: { label: "😊 Positive", color: "text-emerald-600" },
  neutral: { label: "😐 Neutral", color: "text-slate-600" },
  negative: { label: "😠 Negative", color: "text-red-600" },
  hesitant: { label: "🤔 Hesitant", color: "text-amber-600" },
};

export default function CalloutsPage() {
  const params = useParams();
  const [jobs, setJobs] = useState<CalloutJob[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Outcome form state
  const [selectedJobId, setSelectedJobId] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [callbackTime, setCallbackTime] = useState("");
  const [statusNodeId, setStatusNodeId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Get unique companies from jobs
  const companies = useMemo(() => {
    const companySet = new Set<string>();
    jobs.forEach((job) => {
      if (job.employeeCompany) companySet.add(job.employeeCompany);
    });
    return Array.from(companySet).sort();
  }, [jobs]);

  // Get unique dates from jobs
  const dates = useMemo(() => {
    const dateSet = new Set<string>();
    jobs.forEach((job) => {
      if (job.pulledAt) {
        const date = new Date(job.pulledAt).toISOString().split("T")[0];
        dateSet.add(date);
      }
    });
    return Array.from(dateSet).sort().reverse();
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Company filter
      if (companyFilter !== "ALL" && job.employeeCompany !== companyFilter) return false;
      // Date filter
      if (dateFilter) {
        const jobDate = job.pulledAt ? new Date(job.pulledAt).toISOString().split("T")[0] : "";
        if (jobDate !== dateFilter) return false;
      }
      // Outcome filter
      if (outcomeFilter !== "ALL") {
        const jobOutcome = job.outcome?.outcome || "";
        if (jobOutcome !== outcomeFilter) return false;
      }
      return true;
    });
  }, [jobs, companyFilter, dateFilter, outcomeFilter]);

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

  const handleExport = async () => {
    setExporting(true);
    try {
      // Build CSV content
      const headers = [
        "Employee Name",
        "Employee ID",
        "Phone",
        "Company",
        "Job Status",
        "Total Attempts",
        "Outcome",
        "Callback Date",
        "Callback Time",
        "Sentiment",
        "Cooperation Level",
        "Language Preference",
        "Language Issues",
        "Candidate Concerns",
        "Candidate Queries",
        "Special Notes",
        "Notes",
        "Pulled At",
        "Last Attempt At",
        "Posted to Acengage",
      ];

      const rows = filteredJobs.map((job) => [
        job.employeeName || "",
        job.employeeExternalId || "",
        job.employeePhone || "",
        job.employeeCompany || "",
        job.status,
        job.totalAttempts.toString(),
        job.outcome?.outcome || "",
        job.outcome?.callbackDate || "",
        job.outcome?.callbackTime || "",
        job.outcome?.sentiment || "",
        job.outcome?.cooperationLevel || "",
        job.outcome?.languagePreference || "",
        job.outcome?.languageIssues || "",
        (job.outcome?.candidateConcerns || []).join("; "),
        (job.outcome?.candidateQueries || []).join("; "),
        job.outcome?.specialNotes || "",
        job.outcome?.notes || "",
        job.pulledAt ? new Date(job.pulledAt).toLocaleString("en-IN") : "",
        job.lastAttemptAt ? new Date(job.lastAttemptAt).toLocaleString("en-IN") : "",
        job.outcome?.postedAt ? "Yes" : "No",
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        ),
      ].join("\n");

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = dateFilter || new Date().toISOString().split("T")[0];
      const companyStr = companyFilter !== "ALL" ? `_${companyFilter.replace(/\s+/g, "_")}` : "";
      link.download = `callouts_${dateStr}${companyStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
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
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
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
              <option value="FAILED">Failed</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Date:</span>
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="">All Dates</option>
              {dates.map((date) => (
                <option key={date} value={date}>
                  {new Date(date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </option>
              ))}
            </select>
          </div>

          {/* Company Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Company:</span>
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
            >
              <option value="ALL">All Companies</option>
              {companies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          {/* Outcome Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Outcome:</span>
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
            >
              <option value="ALL">All Outcomes</option>
              {Object.entries(OUTCOME_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <Input
              placeholder="Search by name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-sm"
            />
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto
            </label>
            <Button onClick={fetchData} className="text-sm px-3 py-1.5">
              Refresh
            </Button>
            <Button
              onClick={handleExport}
              disabled={exporting || filteredJobs.length === 0}
              className="text-sm px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700"
            >
              {exporting ? "..." : "📥 Export"}
            </Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-400">
          Showing {filteredJobs.length} of {jobs.length} records • Last refresh: {formatTime(lastRefresh.toISOString())}
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
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Sentiment</th>
                <th className="px-4 py-3">Callback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={8}>
                    No callout jobs found. Pull employee data from the Acengage tab to get started.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
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
                      <td className="px-4 py-3 text-slate-600 text-xs">
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
                      <td className="px-4 py-3">
                        {job.outcome?.outcome ? (
                          <span
                            className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                              OUTCOME_LABELS[job.outcome.outcome]?.color || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {OUTCOME_LABELS[job.outcome.outcome]?.label || job.outcome.outcome}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {job.outcome?.sentiment ? (
                          <span className={SENTIMENT_LABELS[job.outcome.sentiment]?.color || "text-slate-600"}>
                            {SENTIMENT_LABELS[job.outcome.sentiment]?.label || job.outcome.sentiment}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {job.outcome?.callbackDate ? (
                          <div className="text-xs">
                            <span className="text-emerald-600 font-medium">
                              📅 {job.outcome.callbackDate}
                            </span>
                            {job.outcome.callbackTime && (
                              <span className="text-slate-500 ml-1">
                                {job.outcome.callbackTime}
                              </span>
                            )}
                            {job.outcome.postedAt && (
                              <span className="ml-1 text-emerald-500" title="Posted to Acengage">✓</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                    {/* Expanded Row - Full Analysis Details */}
                    {expandedJob === job.id && (
                      <tr key={`${job.id}-expanded`}>
                        <td colSpan={8} className="px-4 py-4 bg-slate-50/50">
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Attempt Timeline */}
                            {job.attempts.length > 0 && (
                              <div className="pl-4 border-l-2 border-slate-200 space-y-2">
                                <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                                  Attempt Timeline
                                </div>
                                {job.attempts.map((attempt) => (
                                  <div
                                    key={attempt.id}
                                    className="flex items-center gap-3 text-xs flex-wrap"
                                  >
                                    <span
                                      className={`inline-flex px-2 py-0.5 font-medium rounded ${
                                        STATUS_COLORS[attempt.status] || "bg-slate-100"
                                      }`}
                                    >
                                      #{attempt.attemptNumber} {attempt.status}
                                    </span>
                                    <span className="text-slate-500">{attempt.localDate}</span>
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
                            )}

                            {/* Analysis Details */}
                            {job.outcome && (
                              <div className="pl-4 border-l-2 border-indigo-200 space-y-2">
                                <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                                  📊 VoiceAgent Analysis
                                </div>
                                <div className="grid gap-2 text-xs">
                                  {job.outcome.cooperationLevel && (
                                    <div>
                                      <span className="text-slate-500">Cooperation:</span>{" "}
                                      <span className="font-medium capitalize">{job.outcome.cooperationLevel}</span>
                                    </div>
                                  )}
                                  {job.outcome.languagePreference && job.outcome.languagePreference !== "null" && (
                                    <div>
                                      <span className="text-slate-500">Language:</span>{" "}
                                      <span className="font-medium">{job.outcome.languagePreference}</span>
                                    </div>
                                  )}
                                  {job.outcome.languageIssues && (
                                    <div>
                                      <span className="text-slate-500">Language Issues:</span>{" "}
                                      <span className="text-amber-600">{job.outcome.languageIssues}</span>
                                    </div>
                                  )}
                                  {job.outcome.candidateConcerns && job.outcome.candidateConcerns.length > 0 && (
                                    <div>
                                      <span className="text-slate-500">Concerns:</span>{" "}
                                      <span className="text-red-600">{job.outcome.candidateConcerns.join(", ")}</span>
                                    </div>
                                  )}
                                  {job.outcome.candidateQueries && job.outcome.candidateQueries.length > 0 && (
                                    <div>
                                      <span className="text-slate-500">Queries:</span>{" "}
                                      <span className="text-blue-600">{job.outcome.candidateQueries.join(", ")}</span>
                                    </div>
                                  )}
                                  {job.outcome.rescheduleRequested && (
                                    <div>
                                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                                        🔄 Reschedule Requested
                                      </span>
                                    </div>
                                  )}
                                  {job.outcome.specialNotes && (
                                    <div>
                                      <span className="text-slate-500">Special Notes:</span>{" "}
                                      <span className="italic">{job.outcome.specialNotes}</span>
                                    </div>
                                  )}
                                  {job.outcome.notes && (
                                    <div>
                                      <span className="text-slate-500">Notes:</span>{" "}
                                      <span>{job.outcome.notes}</span>
                                    </div>
                                  )}
                                  {job.outcome.postedAt && (
                                    <div className="text-emerald-600">
                                      ✓ Posted to Acengage at {formatDateTime(job.outcome.postedAt)}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
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
