import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";

/**
 * POST /api/sessions
 * Log a call session from the telephony service
 * 
 * Body:
 * - voiceAgentId?: string - VoiceAgent ID (optional, will try to match by phone)
 * - direction: "inbound" | "outbound"
 * - fromNumber?: string
 * - toNumber?: string
 * - startedAt: string (ISO date)
 * - endedAt?: string (ISO date)
 * - durationSec?: number
 * - callId?: string - External call ID (UCID)
 * - transcriptPath?: string - Path to transcript file
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const {
      voiceAgentId,
      direction = "outbound",
      fromNumber,
      toNumber,
      startedAt,
      endedAt,
      durationSec,
      callId,
      transcriptPath,
    } = body;

    // Calculate duration if not provided
    let duration = durationSec;
    if (!duration && startedAt && endedAt) {
      const start = new Date(startedAt);
      const end = new Date(endedAt);
      duration = Math.round((end.getTime() - start.getTime()) / 1000);
    }

    // Calculate billed minutes (round up to nearest minute)
    const minutesBilled = duration ? Math.ceil(duration / 60) : null;

    // Try to find voiceAgentId if not provided
    let agentId = voiceAgentId;
    if (!agentId && (fromNumber || toNumber)) {
      // Try to match by phone number
      const phone = direction === "outbound" ? toNumber : fromNumber;
      if (phone) {
        const agent = await prisma.voiceAgent.findFirst({
          where: {
            OR: [
              { phoneNumber: { contains: phone.replace(/\D/g, "").slice(-10) } },
            ],
          },
        });
        if (agent) {
          agentId = agent.id;
        }
      }
    }

    // If still no agent, try to get the first active one
    if (!agentId) {
      const defaultAgent = await prisma.voiceAgent.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
      });
      if (defaultAgent) {
        agentId = defaultAgent.id;
      }
    }

    const session = await prisma.callSession.create({
      data: {
        voiceAgentId: agentId || null,
        direction,
        fromNumber: fromNumber || null,
        toNumber: toNumber || null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        endedAt: endedAt ? new Date(endedAt) : null,
        durationSec: duration || null,
        minutesBilled: minutesBilled || null,
        metaJson: {
          callId,
          transcriptPath,
        },
      },
    });

    console.log(`[Sessions] Logged call session: ${session.id} (${direction}, ${duration}s)`);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      voiceAgentId: agentId,
      durationSec: duration,
      minutesBilled,
    });
  } catch (err) {
    console.error("[Sessions] Error logging session:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sessions
 * Get recent call sessions (for debugging)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const voiceAgentId = searchParams.get("voiceAgentId");

    const sessions = await prisma.callSession.findMany({
      where: voiceAgentId ? { voiceAgentId } : undefined,
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        voiceAgent: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[Sessions] Error fetching sessions:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
