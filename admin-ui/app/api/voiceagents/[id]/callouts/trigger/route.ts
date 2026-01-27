import { NextRequest, NextResponse } from "next/server";
import { triggerCalloutsForVoiceAgent } from "@/services/calloutScheduler";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobIds = body.jobIds as string[] | undefined;

    const result = await triggerCalloutsForVoiceAgent(params.id, { jobIds });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Error triggering callouts:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
