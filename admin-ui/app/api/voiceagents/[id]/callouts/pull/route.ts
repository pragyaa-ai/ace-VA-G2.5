import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNcEmployees } from "@/services/acengage";
import { DEFAULT_ACENGAGE_CONFIG } from "@/lib/callouts";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Get VoiceAgent config
    const voiceAgent = await prisma.voiceAgent.findUnique({
      where: { id: params.id },
      include: { voiceProfile: true },
    });

    if (!voiceAgent) {
      return NextResponse.json({ error: "VoiceAgent not found" }, { status: 404 });
    }

    // Get Acengage config from settingsJson
    const settingsJson = voiceAgent.voiceProfile?.settingsJson as Record<string, unknown> | null;
    const acengageConfig = {
      ...DEFAULT_ACENGAGE_CONFIG,
      ...(settingsJson?.acengage as Record<string, unknown> | undefined),
    };

    const getUrl = acengageConfig.getUrl as string;
    if (!getUrl) {
      return NextResponse.json({ error: "Acengage GET URL not configured" }, { status: 400 });
    }

    // Fetch employees from Acengage
    const result = await fetchNcEmployees(getUrl);

    return NextResponse.json({
      employees: result.employees,
      statusTree: result.statusTree,
      count: result.employees.length,
    });
  } catch (err) {
    console.error("Error pulling Acengage data:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
