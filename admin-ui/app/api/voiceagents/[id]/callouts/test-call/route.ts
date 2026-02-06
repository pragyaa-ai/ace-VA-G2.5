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
    const province = (telephonyConfig.province as string) || "";
    const commentsUrl = telephonyConfig.commentsTemplate as string;

    if (!authUrl || !addLeadUrl || !username || !password || !province) {
      return NextResponse.json({ 
        error: "Elision credentials not fully configured. Please fill in Auth URL, Add Lead URL, Username, Password, and Province (Caller ID) in the Telephony tab.",
        missing: {
          authUrl: !authUrl,
          addLeadUrl: !addLeadUrl,
          username: !username,
          password: !password,
          province: !province,
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
      province,
      comments: commentsUrl || "",
    });

    if (!callResult.success) {
      return NextResponse.json({ error: `Failed to trigger call: ${callResult.error}` }, { status: 500 });
    }

    // Create a CalloutJob and CalloutAttempt so test calls appear in the Callouts tab
    const now = new Date();
    const localDate = now.toISOString().split("T")[0];
    
    // Check if a test job already exists for this phone number
    let testJob = await prisma.calloutJob.findFirst({
      where: {
        voiceAgentId: params.id,
        employeePhone: phoneNumber,
        employeeExternalId: `TEST-${phoneNumber}`,
      },
    });

    if (!testJob) {
      // Create new test job
      testJob = await prisma.calloutJob.create({
        data: {
          voiceAgentId: params.id,
          employeeExternalId: `TEST-${phoneNumber}`,
          employeeName: "Test Call",
          employeePhone: phoneNumber,
          employeeCompany: "Test",
          employeeJson: { source: "test-call", phoneNumber },
          status: "IN_PROGRESS",
          totalAttempts: 0,
        },
      });
    }

    // Count existing attempts for this job
    const existingAttempts = await prisma.calloutAttempt.count({
      where: { calloutJobId: testJob.id },
    });

    // Create attempt record
    const attempt = await prisma.calloutAttempt.create({
      data: {
        calloutJobId: testJob.id,
        attemptNumber: existingAttempts + 1,
        localDate,
        status: "TRIGGERED",
        requestedAt: now,
        responseJson: callResult.response as object ?? undefined,
      },
    });

    // Update job
    await prisma.calloutJob.update({
      where: { id: testJob.id },
      data: {
        totalAttempts: existingAttempts + 1,
        lastAttemptAt: now,
        status: "IN_PROGRESS",
      },
    });

    return NextResponse.json({
      success: true,
      phoneNumber,
      jobId: testJob.id,
      attemptId: attempt.id,
      elisionResponse: callResult.response,
    });
  } catch (err) {
    console.error("Error triggering test call:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
