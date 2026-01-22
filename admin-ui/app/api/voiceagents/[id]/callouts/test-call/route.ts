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

    // Field names match what telephony page saves
    const authUrl = telephonyConfig.authUrl as string;
    const addLeadUrl = telephonyConfig.addLeadUrl as string;
    const username = telephonyConfig.username as string;
    const password = telephonyConfig.password as string;
    const listId = telephonyConfig.listId as string;
    const source = (telephonyConfig.source as string) || "Bot";
    const addToHopper = (telephonyConfig.addToHopper as string) || "Y";
    const commentsUrl = telephonyConfig.commentsTemplate as string;

    if (!authUrl || !addLeadUrl || !username || !password) {
      return NextResponse.json({ 
        error: "Elision credentials not fully configured. Please fill in Auth URL, Add Lead URL, Username, and Password in the Telephony tab.",
        missing: {
          authUrl: !authUrl,
          addLeadUrl: !addLeadUrl,
          username: !username,
          password: !password,
        }
      }, { status: 400 });
    }

    // Get fresh token
    const tokenResult = await getElisionToken(authUrl, username, password);
    if (!tokenResult.success || !tokenResult.token) {
      return NextResponse.json({ error: `Failed to get Elision token: ${tokenResult.error}` }, { status: 500 });
    }

    // Trigger call
    const callResult = await triggerElisionCall({
      addLeadUrl,
      token: tokenResult.token,
      phoneNumber,
      listId: listId || "",
      source,
      addToHopper,
      comments: commentsUrl || "",
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
