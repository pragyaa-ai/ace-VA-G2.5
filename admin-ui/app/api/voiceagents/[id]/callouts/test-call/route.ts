import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { triggerElisionCall, getElisionToken } from "@/services/elision";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Get VoiceAgent config
    const voiceAgent = await prisma.voiceAgent.findUnique({
      where: { id: params.id },
      include: { voiceProfile: true },
    });

    if (!voiceAgent) {
      return NextResponse.json({ error: "VoiceAgent not found" }, { status: 404 });
    }

    // Get telephony config from settingsJson
    const settingsJson = voiceAgent.voiceProfile?.settingsJson as Record<string, unknown> | null;
    const telephonyConfig = settingsJson?.telephony as Record<string, unknown> | undefined;

    if (!telephonyConfig) {
      return NextResponse.json({ error: "Telephony settings not configured" }, { status: 400 });
    }

    const elisionAuthUrl = telephonyConfig.elisionAuthUrl as string;
    const elisionAddLeadUrl = telephonyConfig.elisionAddLeadUrl as string;
    const elisionUsername = telephonyConfig.elisionUsername as string;
    const elisionPassword = telephonyConfig.elisionPassword as string;
    const elisionListId = telephonyConfig.elisionListId as string;
    const elisionSource = telephonyConfig.elisionSource as string || "Bot";
    const elisionAddToHopper = telephonyConfig.elisionAddToHopper as string || "Y";
    const elisionCommentsUrl = telephonyConfig.elisionCommentsUrl as string;

    if (!elisionAuthUrl || !elisionAddLeadUrl || !elisionUsername || !elisionPassword) {
      return NextResponse.json({ error: "Elision credentials not fully configured" }, { status: 400 });
    }

    // Get fresh token
    const tokenResult = await getElisionToken(elisionAuthUrl, elisionUsername, elisionPassword);
    if (!tokenResult.success || !tokenResult.token) {
      return NextResponse.json({ error: `Failed to get Elision token: ${tokenResult.error}` }, { status: 500 });
    }

    // Trigger call
    const callResult = await triggerElisionCall({
      addLeadUrl: elisionAddLeadUrl,
      token: tokenResult.token,
      phoneNumber,
      listId: elisionListId,
      source: elisionSource,
      addToHopper: elisionAddToHopper,
      comments: elisionCommentsUrl,
    });

    if (!callResult.success) {
      return NextResponse.json({ error: `Failed to trigger call: ${callResult.error}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      phoneNumber,
      elisionResponse: callResult.response,
    });
  } catch (err) {
    console.error("Error triggering test call:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
