import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateCalloutOutcomeSchema } from "@/lib/validation";
import { updateNcSchedule } from "@/services/acengage";
import { DEFAULT_ACENGAGE_CONFIG } from "@/lib/callouts";
import { startCalloutScheduler } from "@/services/calloutScheduler";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; jobId: string } }
) {
  try {
    startCalloutScheduler();
    const body = await req.json();
    const data = updateCalloutOutcomeSchema.parse(body);

    const job = await prisma.calloutJob.findUnique({
      where: { id: params.jobId },
      include: { voiceAgent: { include: { voiceProfile: true } } },
    });
    if (!job || job.voiceAgentId !== params.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const settingsJson = (job.voiceAgent.voiceProfile?.settingsJson ?? {}) as Record<
      string,
      unknown
    >;
    const acengageConfig = {
      ...DEFAULT_ACENGAGE_CONFIG,
      ...(settingsJson.acengage as Record<string, unknown> | undefined),
    };

    const employeeId = job.employeeExternalId;
    if (!employeeId) {
      return NextResponse.json({ error: "Missing employee id" }, { status: 400 });
    }

    const response = await updateNcSchedule({
      updateUrlTemplate: acengageConfig.updateUrlTemplate,
      employeeId,
      callbackDate: data.callbackDate,
      callbackTime: data.callbackTime,
      nonContactableStatusNodeId: data.nonContactableStatusNodeId,
      notes: data.notes,
    });

    const outcome = await prisma.calloutOutcome.upsert({
      where: { calloutJobId: job.id },
      update: {
        callbackDate: data.callbackDate,
        callbackTime: data.callbackTime,
        nonContactableStatusNodeId: data.nonContactableStatusNodeId,
        notes: data.notes,
        postedAt: new Date(),
      },
      create: {
        calloutJobId: job.id,
        callbackDate: data.callbackDate,
        callbackTime: data.callbackTime,
        nonContactableStatusNodeId: data.nonContactableStatusNodeId,
        notes: data.notes,
        postedAt: new Date(),
      },
    });

    await prisma.calloutJob.update({
      where: { id: job.id },
      data: { status: "COMPLETED" },
    });

    return NextResponse.json({ outcome, response });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
