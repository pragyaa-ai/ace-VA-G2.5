import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startCalloutScheduler } from "@/services/calloutScheduler";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  startCalloutScheduler();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

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
