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
      // Extended analysis fields from Gemini
      candidateConcerns,
      candidateQueries,
      sentiment,
      cooperationLevel,
      languagePreference,
      languageIssues,
      rescheduleRequested,
      specialNotes,
      analysisJson,
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
      // Extended analysis fields
      candidateConcerns?: string[];
      candidateQueries?: string[];
      sentiment?: string;
      cooperationLevel?: string;
      languagePreference?: string;
      languageIssues?: string;
      rescheduleRequested?: boolean;
      specialNotes?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysisJson?: any;
    };

    if (!phoneNumber && !callSid) {
      return NextResponse.json(
        { error: "Either phoneNumber or callSid is required" },
        { status: 400 }
      );
    }

    // Normalize phone number for flexible matching (strip +, country code, spaces)
    const normalizePhone = (phone: string): string => {
      return phone.replace(/[\s\-\+]/g, "").replace(/^91/, "").slice(-10);
    };
    const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : null;

    // Find the most recent attempt for this phone number or callSid
    let attempt = null;
    let job = null;

    if (callSid) {
      attempt = await prisma.calloutAttempt.findFirst({
        where: { callSid },
        include: { calloutJob: true },
      });
      if (attempt) {
        job = attempt.calloutJob;
      }
    }

    if (!attempt && normalizedPhone) {
      // Find by phone number - search with flexible matching
      const allJobs = await prisma.calloutJob.findMany({
        where: { voiceAgentId: params.id },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      // Find job with matching phone (normalized)
      job = allJobs.find((j) => {
        if (!j.employeePhone) return false;
        return normalizePhone(j.employeePhone) === normalizedPhone;
      }) ?? null;

      if (job) {
        attempt = await prisma.calloutAttempt.findFirst({
          where: {
            calloutJobId: job.id,
            status: { in: ["TRIGGERED", "DIALING", "RINGING", "ANSWERED", "QUEUED"] },
          },
          orderBy: { createdAt: "desc" },
          include: { calloutJob: true },
        });
      }
    }

    // If we found a job but no attempt, we can still update the job
    if (!job) {
      return NextResponse.json(
        { error: "No matching callout job found for phone: " + phoneNumber },
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

    // Update the attempt if it exists
    if (attempt) {
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
    }

    // Update job status based on call result
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

    // Create or update outcome if we have any meaningful data
    let acengageResult = null;
    const hasOutcomeData = callbackDate || callbackTime || notes || candidateConcerns || sentiment || analysisJson;
    
    if (hasOutcomeData) {
      await prisma.calloutOutcome.upsert({
        where: { calloutJobId: job.id },
        create: {
          calloutJobId: job.id,
          callbackDate,
          callbackTime,
          notes,
          candidateConcerns: candidateConcerns ?? [],
          candidateQueries: candidateQueries ?? [],
          sentiment,
          cooperationLevel,
          languagePreference,
          languageIssues,
          rescheduleRequested: rescheduleRequested ?? false,
          specialNotes,
          analysisJson: analysisJson ?? undefined,
        },
        update: {
          callbackDate: callbackDate ?? undefined,
          callbackTime: callbackTime ?? undefined,
          notes: notes ?? undefined,
          candidateConcerns: candidateConcerns ?? undefined,
          candidateQueries: candidateQueries ?? undefined,
          sentiment: sentiment ?? undefined,
          cooperationLevel: cooperationLevel ?? undefined,
          languagePreference: languagePreference ?? undefined,
          languageIssues: languageIssues ?? undefined,
          rescheduleRequested: rescheduleRequested ?? undefined,
          specialNotes: specialNotes ?? undefined,
          analysisJson: analysisJson ?? undefined,
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
      attemptId: attempt?.id ?? null,
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
