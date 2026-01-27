import { NextResponse } from "next/server";

import { saveTranscriptSchema } from "@/lib/validation";
import { saveTranscriptToDisk } from "@/services/transcripts/storage";
import { startTranscriptQueueProcessor } from "@/services/transcripts/queueProcessor";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const parsed = saveTranscriptSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid transcript payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const saved = await saveTranscriptToDisk(parsed.data);
    startTranscriptQueueProcessor();

    return NextResponse.json({
      ok: true,
      call_id: parsed.data.call_id,
      transcript_file: saved.transcriptFile,
      queue_file: saved.queueFile,
    });
  } catch (error) {
    console.error("[transcripts] Failed to save transcript", error);
    return NextResponse.json(
      { error: "Failed to save transcript" },
      { status: 500 }
    );
  }
}
