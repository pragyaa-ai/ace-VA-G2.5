import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CalloutAttemptStatus } from "@prisma/client";

/**
 * Endpoint to update call status during the call lifecycle.
 * Called by telephony when:
 * - WebSocket connects (DIALING)
 * - Call starts ringing (RINGING)
 * - Call is answered (ANSWERED)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { phoneNumber, callSid, status } = body as {
      phoneNumber?: string;
      callSid?: string;
      status?: string;
    };

    if (!phoneNumber && !callSid) {
      return NextResponse.json(
        { error: "Either phoneNumber or callSid is required" },
        { status: 400 }
      );
    }

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // Map status string to enum
    const statusMap: Record<string, CalloutAttemptStatus> = {
      dialing: "DIALING",
      ringing: "RINGING",
      answered: "ANSWERED",
    };

    const attemptStatus = statusMap[status.toLowerCase()];
    if (!attemptStatus) {
      return NextResponse.json(
        { error: `Invalid status: ${status}. Valid values: dialing, ringing, answered` },
        { status: 400 }
      );
    }

    // Find the most recent TRIGGERED attempt for this phone/callSid
    let attempt = null;

    if (callSid) {
      attempt = await prisma.calloutAttempt.findFirst({
        where: { callSid },
      });
    }

    if (!attempt && phoneNumber) {
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
            status: { in: ["TRIGGERED", "QUEUED", "DIALING", "RINGING"] },
          },
          orderBy: { createdAt: "desc" },
        });
      }
    }

    if (!attempt) {
      return NextResponse.json(
        { error: "No matching callout attempt found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: attemptStatus,
    };

    if (callSid && !attempt.callSid) {
      updateData.callSid = callSid;
    }

    if (attemptStatus === "DIALING") {
      updateData.dialedAt = now;
    } else if (attemptStatus === "ANSWERED") {
      updateData.answeredAt = now;
    }

    await prisma.calloutAttempt.update({
      where: { id: attempt.id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      status: attemptStatus,
    });
  } catch (err) {
    console.error("Error updating call status:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
