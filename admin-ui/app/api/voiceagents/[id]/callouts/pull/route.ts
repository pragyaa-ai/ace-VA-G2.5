import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchNcEmployees } from "@/services/acengage";
import { DEFAULT_ACENGAGE_CONFIG, safeExtractField } from "@/lib/callouts";
import { triggerCalloutsForVoiceAgent } from "@/services/calloutScheduler";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Check if we should auto-trigger callouts after pull
  const url = new URL(req.url);
  const autoTrigger = url.searchParams.get("autoTrigger") === "true";
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
    } as typeof DEFAULT_ACENGAGE_CONFIG;

    const getUrl = acengageConfig.getUrl as string;
    if (!getUrl) {
      return NextResponse.json({ error: "Acengage GET URL not configured" }, { status: 400 });
    }

    // Fetch employees from Acengage
    const result = await fetchNcEmployees(getUrl);
    const pulledAt = new Date();

    // Save or update CalloutJob records for each employee
    const jobIds: string[] = [];
    const savedEmployees: Array<{
      jobId: string;
      employeeExternalId: string | null;
      employeeName: string | null;
      employeePhone: string | null;
      employeeCompany: string | null;
      isNew: boolean;
    }> = [];

    for (const employee of result.employees) {
      // Extract fields using configured field names with fallbacks
      const employeeExternalId = safeExtractField(
        employee,
        acengageConfig.employeeIdField,
        ["id", "employee_id", "employeeId", "record_id"]
      );

      const employeePhone = safeExtractField(
        employee,
        acengageConfig.phoneField,
        ["phone_number", "phone", "mobile", "contact_number"]
      );

      const employeeName = safeExtractField(
        employee,
        acengageConfig.nameField,
        ["name", "employee_name", "full_name", "employeeName"]
      );

      const employeeCompany = safeExtractField(
        employee,
        acengageConfig.companyField,
        ["company", "company_name", "organization", "companyName"]
      );

      // Skip if no ID
      if (!employeeExternalId) continue;

      const employeeJson = employee as Prisma.InputJsonValue;

      // Check if job already exists
      const existingJob = await prisma.calloutJob.findFirst({
        where: {
          voiceAgentId: params.id,
          employeeExternalId,
        },
      });

      if (existingJob) {
        // Update existing job with fresh data
        await prisma.calloutJob.update({
          where: { id: existingJob.id },
          data: {
            employeeName,
            employeePhone,
            employeeCompany,
            employeeJson,
            pulledAt,
          },
        });
        jobIds.push(existingJob.id);
        savedEmployees.push({
          jobId: existingJob.id,
          employeeExternalId,
          employeeName,
          employeePhone,
          employeeCompany,
          isNew: false,
        });
      } else {
        // Create new job
        const newJob = await prisma.calloutJob.create({
          data: {
            voiceAgentId: params.id,
            employeeExternalId,
            employeeName,
            employeePhone,
            employeeCompany,
            employeeJson,
            pulledAt,
          },
        });
        jobIds.push(newJob.id);
        savedEmployees.push({
          jobId: newJob.id,
          employeeExternalId,
          employeeName,
          employeePhone,
          employeeCompany,
          isNew: true,
        });
      }
    }

    // Update status tree in settings if received
    if (result.statusTree !== null && voiceAgent.voiceProfile) {
      await prisma.voiceProfile.update({
        where: { voiceAgentId: params.id },
        data: {
          settingsJson: {
            ...(settingsJson ?? {}),
            acengage: { ...acengageConfig, statusTree: result.statusTree },
          },
        },
      });
    }

    // Optionally trigger callouts for the saved jobs
    let triggerResult = null;
    if (autoTrigger && jobIds.length > 0) {
      triggerResult = await triggerCalloutsForVoiceAgent(params.id, { jobIds });
    }

    return NextResponse.json({
      employees: result.employees,
      statusTree: result.statusTree,
      count: result.employees.length,
      savedCount: savedEmployees.length,
      newCount: savedEmployees.filter((e) => e.isNew).length,
      updatedCount: savedEmployees.filter((e) => !e.isNew).length,
      jobIds,
      savedEmployees,
      pulledAt: pulledAt.toISOString(),
      triggerResult,
    });
  } catch (err) {
    console.error("Error pulling Acengage data:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
