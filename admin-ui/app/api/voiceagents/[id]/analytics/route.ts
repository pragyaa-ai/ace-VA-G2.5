import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

/**
 * GET /api/voiceagents/[id]/analytics
 * 
 * Returns analytics data for the Acengage VoiceAgent:
 * - Summary stats (total calls, minutes, avg duration, success rate)
 * - Calls by date (chart data)
 * - Outcome distribution (scheduled, not_interested, etc.)
 * - Sentiment distribution
 * - Company distribution
 * 
 * Query params:
 * - period: "today" | "7d" | "30d" | "90d" | "all" (default: "30d")
 * - startDate: custom start date (ISO)
 * - endDate: custom end date (ISO)
 * - company: filter by company name
 * - outcome: filter by outcome
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";
    const customStartDate = searchParams.get("startDate");
    const customEndDate = searchParams.get("endDate");
    const filterCompany = searchParams.get("company");
    const filterOutcome = searchParams.get("outcome");

    // Calculate date range
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    const now = new Date();

    if (customStartDate && customEndDate) {
      startDate = new Date(customStartDate);
      endDate = new Date(customEndDate);
      endDate.setHours(23, 59, 59, 999);
    } else {
      switch (period) {
        case "today":
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "all":
          startDate = undefined;
          break;
      }
    }

    // Build where clause for CalloutJobs
    const jobWhere: Record<string, unknown> = { voiceAgentId: params.id };
    if (startDate) {
      jobWhere.updatedAt = { 
        gte: startDate, 
        ...(endDate ? { lte: endDate } : {}) 
      };
    }
    if (filterCompany) {
      jobWhere.employeeCompany = filterCompany;
    }

    // Fetch callout jobs with outcomes
    const jobs = await prisma.calloutJob.findMany({
      where: jobWhere,
      include: {
        outcome: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    // Filter by outcome if specified
    let filteredJobs = jobs;
    if (filterOutcome) {
      filteredJobs = jobs.filter((j) => j.outcome?.outcome === filterOutcome);
    }

    // Process and aggregate data
    const callsByDate: Record<string, { calls: number; minutes: number; completed: number }> = {};
    const outcomeDistribution: Record<string, number> = {};
    const sentimentDistribution: Record<string, number> = {};
    const companyDistribution: Record<string, number> = {};
    const cooperationDistribution: Record<string, number> = {};

    let totalDuration = 0;
    let totalMinutes = 0;
    let totalCompleted = 0;
    let totalScheduled = 0;

    for (const job of filteredJobs) {
      const outcome = job.outcome;
      const lastAttempt = job.attempts[0];
      
      // Get date from last attempt or job update
      const callDate = lastAttempt?.completedAt || job.updatedAt;
      const dateKey = callDate.toISOString().split("T")[0];
      
      if (!callsByDate[dateKey]) {
        callsByDate[dateKey] = { calls: 0, minutes: 0, completed: 0 };
      }
      callsByDate[dateKey].calls += 1;

      // Track duration from attempts
      const duration = lastAttempt?.callDurationSec || 0;
      totalDuration += duration;
      const minutes = Math.ceil(duration / 60);
      totalMinutes += minutes;
      callsByDate[dateKey].minutes += minutes;

      // Track completed (has outcome)
      if (outcome) {
        totalCompleted += 1;
        callsByDate[dateKey].completed += 1;
      }

      // Outcome distribution
      const outcomeValue = outcome?.outcome || "pending";
      outcomeDistribution[outcomeValue] = (outcomeDistribution[outcomeValue] || 0) + 1;
      
      if (outcomeValue === "scheduled") {
        totalScheduled += 1;
      }

      // Sentiment distribution
      const sentiment = outcome?.sentiment || "unknown";
      sentimentDistribution[sentiment] = (sentimentDistribution[sentiment] || 0) + 1;

      // Company distribution
      const company = job.employeeCompany || "Unknown";
      companyDistribution[company] = (companyDistribution[company] || 0) + 1;

      // Cooperation level distribution
      const cooperation = outcome?.cooperationLevel || "unknown";
      cooperationDistribution[cooperation] = (cooperationDistribution[cooperation] || 0) + 1;
    }

    // Convert to chart data
    const chartData = Object.entries(callsByDate)
      .map(([date, data]) => ({
        date,
        calls: data.calls,
        minutes: data.minutes,
        completed: data.completed,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Summary stats
    const totalCalls = filteredJobs.length;
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const successRate = totalCalls > 0 ? Math.round((totalScheduled / totalCalls) * 100 * 10) / 10 : 0;
    const completionRate = totalCalls > 0 ? Math.round((totalCompleted / totalCalls) * 100 * 10) / 10 : 0;

    // Get unique companies for filter dropdown
    const companies = await prisma.calloutJob.findMany({
      where: { voiceAgentId: params.id },
      select: { employeeCompany: true },
      distinct: ["employeeCompany"],
    });
    const uniqueCompanies = companies
      .map((c) => c.employeeCompany)
      .filter((c): c is string => !!c);

    // Get unique outcomes for filter dropdown
    const uniqueOutcomes = Object.keys(outcomeDistribution).filter((o) => o !== "pending");

    return NextResponse.json({
      summary: {
        totalCalls,
        totalMinutes,
        avgDuration,
        successRate,
        completionRate,
        totalScheduled,
        totalCompleted,
      },
      chartData,
      outcomeDistribution,
      sentimentDistribution,
      companyDistribution,
      cooperationDistribution,
      filters: {
        companies: uniqueCompanies,
        outcomes: uniqueOutcomes,
      },
      period,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
