import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ACENGAGE_CONFIG, safeExtractField } from "@/lib/callouts";
import { Prisma } from "@prisma/client";

type UploadEmployee = Record<string, unknown>;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const employees = body.employees as UploadEmployee[];

    if (!employees || !Array.isArray(employees) || employees.length === 0) {
      return NextResponse.json({ error: "No employees provided" }, { status: 400 });
    }

    // Get VoiceAgent config
    const voiceAgent = await prisma.voiceAgent.findUnique({
      where: { id: params.id },
      include: { voiceProfile: true },
    });

    if (!voiceAgent) {
      return NextResponse.json({ error: "VoiceAgent not found" }, { status: 404 });
    }

    // Get Acengage config for field mapping
    const settingsJson = voiceAgent.voiceProfile?.settingsJson as Record<string, unknown> | null;
    const acengageConfig = {
      ...DEFAULT_ACENGAGE_CONFIG,
      ...(settingsJson?.acengage as Record<string, unknown> | undefined),
    } as typeof DEFAULT_ACENGAGE_CONFIG;

    const pulledAt = new Date();
    const jobIds: string[] = [];
    const savedEmployees: Array<{
      jobId: string;
      employeeExternalId: string | null;
      employeeName: string | null;
      employeePhone: string | null;
      employeeCompany: string | null;
      isNew: boolean;
    }> = [];

    for (const employee of employees) {
      // Extract fields using configured field names with fallbacks
      const employeeExternalId = safeExtractField(
        employee,
        acengageConfig.employeeIdField,
        ["id", "employee_id", "employeeId", "record_id"]
      );

      const employeePhone = safeExtractField(
        employee,
        acengageConfig.phoneField,
        ["mobile", "Mobile", "phone_number", "phone", "Phone", "contact_number", "phoneNumber"]
      );

      const employeeName = safeExtractField(
        employee,
        acengageConfig.nameField,
        ["name", "employee_name", "full_name", "employeeName"]
      );

      const employeeCompany = safeExtractField(
        employee,
        acengageConfig.companyField,
        ["client", "company", "company_name", "organization", "companyName"]
      );

      // Skip if no phone
      if (!employeePhone) continue;

      // Generate ID if not provided
      const finalEmployeeExternalId = employeeExternalId || `UPLOAD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const employeeJson = employee as Prisma.InputJsonValue;

      // Check if job already exists (by phone or external ID)
      const existingJob = await prisma.calloutJob.findFirst({
        where: {
          voiceAgentId: params.id,
          OR: [
            { employeeExternalId: finalEmployeeExternalId },
            { employeePhone },
          ],
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
            employeeExternalId: finalEmployeeExternalId,
            employeeJson,
            pulledAt,
          },
        });
        jobIds.push(existingJob.id);
        savedEmployees.push({
          jobId: existingJob.id,
          employeeExternalId: finalEmployeeExternalId,
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
            employeeExternalId: finalEmployeeExternalId,
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
          employeeExternalId: finalEmployeeExternalId,
          employeeName,
          employeePhone,
          employeeCompany,
          isNew: true,
        });
      }
    }

    return NextResponse.json({
      savedCount: savedEmployees.length,
      newCount: savedEmployees.filter((e) => e.isNew).length,
      updatedCount: savedEmployees.filter((e) => !e.isNew).length,
      jobIds,
      savedEmployees,
      pulledAt: pulledAt.toISOString(),
    });
  } catch (err) {
    console.error("Error uploading callout data:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
