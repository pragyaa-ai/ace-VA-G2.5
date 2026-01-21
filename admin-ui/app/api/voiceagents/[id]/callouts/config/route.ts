import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  updateCalloutConfigSchema,
  UpdateCalloutConfigInput,
} from "@/lib/validation";
import {
  DEFAULT_ACENGAGE_CONFIG,
  DEFAULT_CALLOUT_SCHEDULE,
} from "@/lib/callouts";
import { startCalloutScheduler } from "@/services/calloutScheduler";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  startCalloutScheduler();
  const schedule = await prisma.calloutSchedule.findUnique({
    where: { voiceAgentId: params.id },
  });
  const voiceProfile = await prisma.voiceProfile.findUnique({
    where: { voiceAgentId: params.id },
  });
  const settingsJson = (voiceProfile?.settingsJson ?? {}) as Record<string, unknown>;
  const acengage = {
    ...DEFAULT_ACENGAGE_CONFIG,
    ...(settingsJson.acengage as Record<string, unknown> | undefined),
  };

  return NextResponse.json({
    schedule: schedule ?? DEFAULT_CALLOUT_SCHEDULE,
    acengage,
  });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    startCalloutScheduler();
    const body = await req.json();
    const data = updateCalloutConfigSchema.parse(body) as UpdateCalloutConfigInput;

    const schedule = await prisma.calloutSchedule.upsert({
      where: { voiceAgentId: params.id },
      update: {
        isActive: data.schedule.isActive,
        runAtLocalTime: data.schedule.runAtLocalTime,
        timezone: data.schedule.timezone,
        attemptsPerDay: data.schedule.attemptsPerDay,
        maxDays: data.schedule.maxDays,
        escalationEnabled: data.schedule.escalationEnabled,
      },
      create: {
        voiceAgentId: params.id,
        isActive: data.schedule.isActive,
        runAtLocalTime: data.schedule.runAtLocalTime,
        timezone: data.schedule.timezone,
        attemptsPerDay: data.schedule.attemptsPerDay,
        maxDays: data.schedule.maxDays,
        escalationEnabled: data.schedule.escalationEnabled,
      },
    });

    const existingProfile = await prisma.voiceProfile.findUnique({
      where: { voiceAgentId: params.id },
    });
    const nextSettings = {
      ...(existingProfile?.settingsJson ?? {}),
      acengage: data.acengage,
    };

    await prisma.voiceProfile.upsert({
      where: { voiceAgentId: params.id },
      update: {
        voiceName: existingProfile?.voiceName ?? "Voice",
        settingsJson: nextSettings,
      },
      create: {
        voiceAgentId: params.id,
        voiceName: existingProfile?.voiceName ?? "Voice",
        settingsJson: nextSettings,
      },
    });

    return NextResponse.json({ schedule, acengage: data.acengage });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
