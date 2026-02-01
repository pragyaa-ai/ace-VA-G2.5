"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface AnalyticsData {
  summary: {
    totalCalls: number;
    totalMinutes: number;
    avgDuration: number;
    successRate: number;
    completionRate: number;
    totalScheduled: number;
    totalCompleted: number;
  };
  chartData: Array<{
    date: string;
    calls: number;
    minutes: number;
    completed: number;
  }>;
  outcomeDistribution: Record<string, number>;
  sentimentDistribution: Record<string, number>;
  companyDistribution: Record<string, number>;
  cooperationDistribution: Record<string, number>;
  filters: {
    companies: string[];
    outcomes: string[];
  };
  period: string;
}

const OUTCOME_COLORS: Record<string, string> = {
  scheduled: "#22c55e",
  not_interested: "#ef4444",
  callback_requested: "#f59e0b",
  no_response: "#94a3b8",
  disconnected: "#6b7280",
  busy: "#8b5cf6",
  incomplete: "#ec4899",
  pending: "#64748b",
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "#22c55e",
  neutral: "#64748b",
  negative: "#ef4444",
  hesitant: "#f59e0b",
  unknown: "#cbd5e1",
};

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "all", label: "All Time" },
];

export default function AnalyticsPage() {
  const params = useParams();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");
  const [company, setCompany] = useState("");
  const [outcome, setOutcome] = useState("");

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("period", period);
      if (company) queryParams.set("company", company);
      if (outcome) queryParams.set("outcome", outcome);

      const res = await fetch(
        `/api/voiceagents/${params.id}/analytics?${queryParams}`
      );
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
    } finally {
      setLoading(false);
    }
  }, [params.id, period, company, outcome]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Transform distributions for pie charts
  const outcomeData = analytics
    ? Object.entries(analytics.outcomeDistribution).map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        value,
        color: OUTCOME_COLORS[name] || "#64748b",
      }))
    : [];

  const sentimentData = analytics
    ? Object.entries(analytics.sentimentDistribution).map(([name, value]) => ({
        name,
        value,
        color: SENTIMENT_COLORS[name] || "#64748b",
      }))
    : [];

  const companyData = analytics
    ? Object.entries(analytics.companyDistribution)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name, value }))
    : [];

  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Period:</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {analytics?.filters.companies && analytics.filters.companies.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Company:</label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">All Companies</option>
              {analytics.filters.companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        {analytics?.filters.outcomes && analytics.filters.outcomes.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Outcome:</label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="">All Outcomes</option>
              {analytics.filters.outcomes.map((o) => (
                <option key={o} value={o}>
                  {o.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <p className="text-sm text-emerald-600 font-medium">Total Calls</p>
          <p className="text-3xl font-bold text-slate-900">
            {analytics?.summary.totalCalls || 0}
          </p>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <p className="text-sm text-blue-600 font-medium">Minutes Billed</p>
          <p className="text-3xl font-bold text-slate-900">
            {analytics?.summary.totalMinutes || 0}
          </p>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <p className="text-sm text-amber-600 font-medium">Avg Duration</p>
          <p className="text-3xl font-bold text-slate-900">
            {analytics?.summary.avgDuration || 0}
            <span className="text-lg text-slate-500 ml-1">sec</span>
          </p>
        </Card>
        <Card className="p-5 bg-gradient-to-br from-violet-50 to-white border-violet-100">
          <p className="text-sm text-violet-600 font-medium">Success Rate</p>
          <p className="text-3xl font-bold text-slate-900">
            {analytics?.summary.successRate || 0}
            <span className="text-lg text-slate-500 ml-1">%</span>
          </p>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calls Over Time */}
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Calls Over Time
          </h3>
          <div className="h-64">
            {analytics?.chartData && analytics.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="calls"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="Calls"
                  />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                    name="Completed"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data for selected period
              </div>
            )}
          </div>
        </Card>

        {/* Minutes Over Time */}
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Minutes Over Time
          </h3>
          <div className="h-64">
            {analytics?.chartData && analytics.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Minutes" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No data for selected period
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Outcome Distribution */}
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Outcome Distribution
          </h3>
          <div className="h-64">
            {outcomeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {outcomeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No outcome data
              </div>
            )}
          </div>
        </Card>

        {/* Sentiment Distribution */}
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Sentiment Distribution
          </h3>
          <div className="h-64">
            {sentimentData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sentimentData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                  >
                    {sentimentData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No sentiment data
              </div>
            )}
          </div>
        </Card>

        {/* Company Distribution */}
        <Card className="p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            Calls by Company
          </h3>
          <div className="h-64">
            {companyData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={companyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip />
                  <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="Calls" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                No company data
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Summary Stats Table */}
      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Key Metrics Summary
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Scheduled</p>
            <p className="text-2xl font-bold text-emerald-600">
              {analytics?.summary.totalScheduled || 0}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Completed Calls</p>
            <p className="text-2xl font-bold text-blue-600">
              {analytics?.summary.totalCompleted || 0}
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Completion Rate</p>
            <p className="text-2xl font-bold text-violet-600">
              {analytics?.summary.completionRate || 0}%
            </p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">Success Rate</p>
            <p className="text-2xl font-bold text-amber-600">
              {analytics?.summary.successRate || 0}%
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
