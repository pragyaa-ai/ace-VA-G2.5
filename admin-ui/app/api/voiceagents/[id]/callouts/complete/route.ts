import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CalloutAttemptStatus } from "@prisma/client";
import { updateNcSchedule } from "@/services/acengage";
import { DEFAULT_ACENGAGE_CONFIG } from "@/lib/callouts";

/**
 * Endpoint for telephony service to report call completion status.
 * Called when a call ends, with details about whether it was answered,
 * call duration, and any extracted data (callback date/time).
 * 
 * If callback date/time is provided, automatically posts to Acengage API.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const {
      phoneNumber,
      callSid,
      status,
      durationSec,
      answeredAt,
      completedAt,
      transcriptId,
      callbackDate,
      callbackTime,
      notes,
    } = body as {
      phoneNumber?: string;
      callSid?: string;
      status?: string;
      durationSec?: number;
      answeredAt?: string;
      completedAt?: string;
      transcriptId?: string;
      callbackDate?: string;
      callbackTime?: string;
      notes?: string;
    };

    if (!phoneNumber && !callSid) {
      return NextResponse.json(
        { error: "Either phoneNumber or callSid is required" },
        { status: 400 }
      );
    }

    // Find the most recent attempt for this phone number or callSid
    let attempt = null;

    if (callSid) {
      attempt = await prisma.calloutAttempt.findFirst({
        where: { callSid },
        include: { calloutJob: true },
      });
    }

    if (!attempt && phoneNumber) {
      // Find by phone number - get most recent TRIGGERED or DIALING attempt
      const job = await prisma.calloutJob.findFirst({
        where: {
          voiceAgentId: params.id,
          employeePhone: phoneNumber,
        },
        orderBy: { updatedAt: "desc" },
      });

      if (job) {
        attempt = await prisma.calloutAttempt.findFirst({
          where: {
            calloutJobId: job.id,
            status: { in: ["TRIGGERED", "DIALING", "RINGING", "ANSWERED"] },
          },
          orderBy: { createdAt: "desc" },
          include: { calloutJob: true },
        });
      }
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "No matching callout attempt found" },
        { status: 404 }
      );
    }

    // Map status string to enum
    const statusMap: Record<string, CalloutAttemptStatus> = {
      answered: "ANSWERED",
      completed: "COMPLETED",
      no_answer: "NO_ANSWER",
      busy: "BUSY",
      failed: "FAILED",
      voicemail: "VOICEMAIL",
    };

    const attemptStatus = statusMap[status?.toLowerCase() ?? ""] ?? "COMPLETED";
    const now = new Date();

    // Update the attempt
    await prisma.calloutAttempt.update({
      where: { id: attempt.id },
      data: {
        status: attemptStatus,
        callSid: callSid ?? attempt.callSid,
        callDurationSec: durationSec,
        answeredAt: answeredAt ? new Date(answeredAt) : undefined,
        completedAt: completedAt ? new Date(completedAt) : now,
        callTranscriptId: transcriptId,
      },
    });

    // Update job status based on call result
    const job = attempt.calloutJob;
    let jobStatus = job.status;

    if (attemptStatus === "COMPLETED" || attemptStatus === "ANSWERED") {
      // If we have callback info, mark as completed
      if (callbackDate) {
        jobStatus = "COMPLETED";
      }
    }

    await prisma.calloutJob.update({
      where: { id: job.id },
      data: {
        status: jobStatus,
        lastAttemptAt: now,
      },
    });

    // Create or update outcome if callback info provided
    let acengageResult = null;
    if (callbackDate || callbackTime || notes) {
      await prisma.calloutOutcome.upsert({
        where: { calloutJobId: job.id },
        create: {
          calloutJobId: job.id,
          callbackDate,
          callbackTime,
          notes,
        },
        update: {
          callbackDate: callbackDate ?? undefined,
          callbackTime: callbackTime ?? undefined,
          notes: notes ?? undefined,
        },
      });

      // If we have callback info, post to Acengage API
      if (callbackDate && job.employeeExternalId) {
        try {
          // Get Acengage config from voice agent
          const voiceAgent = await prisma.voiceAgent.findUnique({
            where: { id: params.id },
            include: { voiceProfile: true },
          });

          const settingsJson = (voiceAgent?.voiceProfile?.settingsJson ?? {}) as Record<
            string,
            unknown
          >;
          const acengageConfig = {
            ...DEFAULT_ACENGAGE_CONFIG,
            ...(settingsJson.acengage as Record<string, unknown> | undefined),
          };

          console.log(
            `[complete] 📤 Posting to Acengage: employee=${job.employeeExternalId}, date=${callbackDate}, time=${callbackTime}`
          );

          acengageResult = await updateNcSchedule({
            updateUrlTemplate: acengageConfig.updateUrlTemplate,
            employeeId: job.employeeExternalId,
            callbackDate,
            callbackTime,
            notes,
          });

          // Update outcome with posted timestamp
          await prisma.calloutOutcome.update({
            where: { calloutJobId: job.id },
            data: { postedAt: new Date() },
          });

          console.log(`[complete] ✅ Acengage updated for employee ${job.employeeExternalId}`);
        } catch (acengageErr) {
          console.error(`[complete] ❌ Acengage post failed:`, acengageErr);
          acengageResult = { error: String(acengageErr) };
        }
      }
    }

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      jobId: job.id,
      status: attemptStatus,
      acengagePosted: acengageResult !== null,
      acengageResult,
    });
  } catch (err) {
    console.error("Error updating call completion:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
