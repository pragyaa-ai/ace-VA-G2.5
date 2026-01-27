import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startCalloutScheduler } from "@/services/calloutScheduler";
import { CalloutJobStatus, Prisma } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  startCalloutScheduler();
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const searchParam = url.searchParams.get("search");
  const dateFromParam = url.searchParams.get("dateFrom");
  const dateToParam = url.searchParams.get("dateTo");
  const includeSummary = url.searchParams.get("summary") === "true";

  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 100;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

  if (statusParam && !Object.values(CalloutJobStatus).includes(statusParam as CalloutJobStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const status = statusParam as CalloutJobStatus | undefined;

  // Build where clause
  const where: Prisma.CalloutJobWhereInput = {
    voiceAgentId: params.id,
  };

  if (status) {
    where.status = status;
  }

  if (searchParam) {
    where.OR = [
      { employeeName: { contains: searchParam, mode: "insensitive" } },
      { employeePhone: { contains: searchParam } },
      { employeeCompany: { contains: searchParam, mode: "insensitive" } },
      { employeeExternalId: { contains: searchParam } },
    ];
  }

  if (dateFromParam) {
    where.pulledAt = { gte: new Date(dateFromParam) };
  }

  if (dateToParam) {
    where.pulledAt = {
      ...(where.pulledAt as object),
      lte: new Date(dateToParam + "T23:59:59.999Z"),
    };
  }

  const jobs = await prisma.calloutJob.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      attempts: { orderBy: { attemptNumber: "desc" } },
      outcome: true,
    },
  });

  // Calculate summary if requested
  let summary = null;
  if (includeSummary) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalJobs,
      pendingJobs,
      inProgressJobs,
      completedJobs,
      escalatedJobs,
      pulledToday,
      activeAttempts,
    ] = await Promise.all([
      prisma.calloutJob.count({ where: { voiceAgentId: params.id } }),
      prisma.calloutJob.count({ where: { voiceAgentId: params.id, status: "PENDING" } }),
      prisma.calloutJob.count({ where: { voiceAgentId: params.id, status: "IN_PROGRESS" } }),
      prisma.calloutJob.count({ where: { voiceAgentId: params.id, status: "COMPLETED" } }),
      prisma.calloutJob.count({ where: { voiceAgentId: params.id, status: "ESCALATED" } }),
      prisma.calloutJob.count({
        where: { voiceAgentId: params.id, pulledAt: { gte: today } },
      }),
      prisma.calloutAttempt.count({
        where: {
          calloutJob: { voiceAgentId: params.id },
          status: { in: ["TRIGGERED", "DIALING", "RINGING", "ANSWERED"] },
        },
      }),
    ]);

    // Count outcomes with scheduled callbacks
    const scheduledCallbacks = await prisma.calloutOutcome.count({
      where: {
        calloutJob: { voiceAgentId: params.id },
        callbackDate: { not: null },
      },
    });

    summary = {
      totalJobs,
      pendingJobs,
      inProgressJobs,
      completedJobs,
      escalatedJobs,
      pulledToday,
      activeAttempts,
      scheduledCallbacks,
    };
  }

  return NextResponse.json({
    jobs,
    summary,
  });
}
