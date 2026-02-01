import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

/**
 * GET /api/voiceagents/[id]/calls
 * 
 * Returns paginated list of calls with full details from CalloutJob + CalloutOutcome
 * 
 * Query params:
 * - page: page number (default: 1)
 * - limit: items per page (default: 20)
 * - startDate: filter by start date (ISO)
 * - endDate: filter by end date (ISO)
 * - company: filter by company
 * - outcome: filter by outcome
 * - sentiment: filter by sentiment
 * - search: search by name or phone
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const filterCompany = searchParams.get("company");
    const filterOutcome = searchParams.get("outcome");
    const filterSentiment = searchParams.get("sentiment");
    const search = searchParams.get("search");

    // Build where clause
    const where: Record<string, unknown> = { voiceAgentId: params.id };

    if (startDate && endDate) {
      where.updatedAt = {
        gte: new Date(startDate),
        lte: new Date(endDate + "T23:59:59.999Z"),
      };
    }

    if (filterCompany) {
      where.employeeCompany = filterCompany;
    }

    if (search) {
      where.OR = [
        { employeeName: { contains: search, mode: "insensitive" } },
        { employeePhone: { contains: search } },
      ];
    }

    // Count total for pagination
    const total = await prisma.calloutJob.count({ where });

    // Fetch jobs with all related data
    const jobs = await prisma.calloutJob.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        outcome: true,
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });

    // Apply post-fetch filters for outcome/sentiment (stored in outcome relation)
    let filteredJobs = jobs;
    if (filterOutcome) {
      filteredJobs = filteredJobs.filter((j) => j.outcome?.outcome === filterOutcome);
    }
    if (filterSentiment) {
      filteredJobs = filteredJobs.filter((j) => j.outcome?.sentiment === filterSentiment);
    }

    // Transform to call records
    const calls = filteredJobs.map((job) => {
      const lastAttempt = job.attempts[0];
      const outcome = job.outcome;

      return {
        id: job.id,
        callId: lastAttempt?.callSid || null,
        
        // Employee info
        employeeName: job.employeeName,
        employeePhone: job.employeePhone,
        company: job.employeeCompany,
        
        // Call timing
        startedAt: lastAttempt?.answeredAt || lastAttempt?.dialedAt || job.updatedAt,
        endedAt: lastAttempt?.completedAt || null,
        durationSec: lastAttempt?.callDurationSec || null,
        minutesBilled: lastAttempt?.callDurationSec 
          ? Math.ceil(lastAttempt.callDurationSec / 60) 
          : null,
        
        // Status
        status: job.status,
        attemptStatus: lastAttempt?.status || null,
        totalAttempts: job.totalAttempts,
        
        // Outcome and analysis (from CalloutOutcome)
        outcome: outcome?.outcome || null,
        callbackDate: outcome?.callbackDate || null,
        callbackTime: outcome?.callbackTime || null,
        sentiment: outcome?.sentiment || null,
        cooperationLevel: outcome?.cooperationLevel || null,
        languagePreference: outcome?.languagePreference || null,
        
        // Extended analysis
        candidateConcerns: outcome?.candidateConcerns || [],
        candidateQueries: outcome?.candidateQueries || [],
        languageIssues: outcome?.languageIssues || null,
        specialNotes: outcome?.specialNotes || null,
        rescheduleRequested: outcome?.rescheduleRequested || false,
        
        // Metadata
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
    });

    return NextResponse.json({
      calls,
      pagination: {
        page,
        limit,
        total: filterOutcome || filterSentiment ? filteredJobs.length : total,
        pages: Math.ceil((filterOutcome || filterSentiment ? filteredJobs.length : total) / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching calls:", error);
    return NextResponse.json({ error: "Failed to fetch calls" }, { status: 500 });
  }
}
