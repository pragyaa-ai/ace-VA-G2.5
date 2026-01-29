import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/voiceagents/[id]/callouts/jobs/[jobId]/reset
 * Reset a callout job to PENDING status for re-testing.
 * Deletes associated attempts and outcomes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; jobId: string } }
) {
  try {
    const { jobId } = params;

    // Verify job exists
    const job = await prisma.calloutJob.findUnique({
      where: { id: jobId },
      select: { id: true, employeeName: true, employeePhone: true, status: true },
    });

    if (!job) {
      return NextResponse.json(
        { error: "Callout job not found" },
        { status: 404 }
      );
    }

    // Delete associated outcome
    await prisma.calloutOutcome.deleteMany({
      where: { calloutJobId: jobId },
    });

    // Delete associated attempts
    await prisma.calloutAttempt.deleteMany({
      where: { calloutJobId: jobId },
    });

    // Reset job status
    const updatedJob = await prisma.calloutJob.update({
      where: { id: jobId },
      data: {
        status: "PENDING",
        totalAttempts: 0,
        lastAttemptAt: null,
      },
    });

    console.log(
      `[reset] ✅ Reset job ${jobId} (${job.employeeName || job.employeePhone}) from ${job.status} to PENDING`
    );

    return NextResponse.json({
      success: true,
      message: `Job reset successfully`,
      job: {
        id: updatedJob.id,
        employeeName: updatedJob.employeeName,
        employeePhone: updatedJob.employeePhone,
        status: updatedJob.status,
      },
    });
  } catch (error) {
    console.error("[reset] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset job" },
      { status: 500 }
    );
  }
}
