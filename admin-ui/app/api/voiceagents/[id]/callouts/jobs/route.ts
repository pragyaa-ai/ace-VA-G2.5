import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startCalloutScheduler } from "@/services/calloutScheduler";
import { CalloutJobStatus } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  startCalloutScheduler();
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 100;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

  if (statusParam && !Object.values(CalloutJobStatus).includes(statusParam as CalloutJobStatus)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }
  const status = statusParam as CalloutJobStatus | undefined;

  const jobs = await prisma.calloutJob.findMany({
    where: {
      voiceAgentId: params.id,
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      attempts: { orderBy: { attemptNumber: "asc" } },
      outcome: true,
    },
  });

  return NextResponse.json(jobs);
}
