import { prisma } from "@/lib/prisma";
import { DEFAULT_ACENGAGE_CONFIG, safeExtractField } from "@/lib/callouts";
import { fetchNcEmployees } from "@/services/acengage";
import { triggerElisionCallout } from "@/services/elision";
import { Prisma } from "@prisma/client";

type SchedulerHandle = {
  intervalId: ReturnType<typeof setInterval>;
};

const GLOBAL_KEY = "__acengageCalloutScheduler";
const POLL_INTERVAL_MS = 60_000;

const getLocalDateString = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
};

const getLocalTimeString = (date: Date, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
};

const shouldRunSchedule = (schedule: {
  runAtLocalTime: string;
  timezone: string;
  lastRunAt: Date | null;
}): boolean => {
  const now = new Date();
  const localDate = getLocalDateString(now, schedule.timezone);
  const localTime = getLocalTimeString(now, schedule.timezone);
  const lastRunDate = schedule.lastRunAt
    ? getLocalDateString(schedule.lastRunAt, schedule.timezone)
    : null;

  if (lastRunDate === localDate) return false;
  return localTime >= schedule.runAtLocalTime;
};

const safeString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return `${value}`;
  return null;
};

type TriggerResult = {
  triggered: number;
  failed: number;
  skipped: number;
  attemptIds: string[];
};

/**
 * Trigger callouts for all pending jobs for a given voice agent.
 * This can be called after data pull or by the scheduler.
 */
export const triggerCalloutsForVoiceAgent = async (
  voiceAgentId: string,
  options?: { jobIds?: string[] }
): Promise<TriggerResult> => {
  const result: TriggerResult = {
    triggered: 0,
    failed: 0,
    skipped: 0,
    attemptIds: [],
  };

  // Get voice agent with config
  const voiceAgent = await prisma.voiceAgent.findUnique({
    where: { id: voiceAgentId },
    include: {
      voiceProfile: true,
      calloutSchedule: true,
    },
  });

  if (!voiceAgent) {
    console.error("[callouts] VoiceAgent not found:", voiceAgentId);
    return result;
  }

  const schedule = voiceAgent.calloutSchedule;
  if (!schedule || !schedule.isActive) {
    console.log("[callouts] Schedule not active for:", voiceAgentId);
    return result;
  }

  const settingsJson = (voiceAgent.voiceProfile?.settingsJson ?? {}) as Record<string, unknown>;
  const telephonyConfig = (settingsJson.telephony ?? {}) as Record<string, unknown>;

  const addLeadUrl = safeString(telephonyConfig.addLeadUrl);
  const accessToken = safeString(telephonyConfig.accessToken);
  const listId = safeString(telephonyConfig.listId);
  const source = safeString(telephonyConfig.source) ?? "Bot";
  const addToHopper = safeString(telephonyConfig.addToHopper) ?? "Y";
  const comments = safeString(telephonyConfig.commentsTemplate);

  if (!addLeadUrl || !accessToken || !listId || !comments) {
    console.error("[callouts] Missing Elision telephony config", { voiceAgentId });
    return result;
  }

  const todayLocal = getLocalDateString(new Date(), schedule.timezone);
  const maxAttempts = schedule.attemptsPerDay * schedule.maxDays;

  // Get jobs to process
  const whereClause: Prisma.CalloutJobWhereInput = {
    voiceAgentId,
    status: { in: ["PENDING", "IN_PROGRESS"] },
  };

  if (options?.jobIds && options.jobIds.length > 0) {
    whereClause.id = { in: options.jobIds };
  }

  const jobs = await prisma.calloutJob.findMany({
    where: whereClause,
    include: { attempts: true },
  });

  for (const job of jobs) {
    // Skip if no phone number
    const phoneNumber = job.employeePhone;
    if (!phoneNumber) {
      result.skipped++;
      continue;
    }

    // Skip if max attempts reached
    if (job.totalAttempts >= maxAttempts) {
      if (schedule.escalationEnabled && job.status !== "ESCALATED") {
        await prisma.calloutJob.update({
          where: { id: job.id },
          data: { status: "ESCALATED" },
        });
      }
      result.skipped++;
      continue;
    }

    // Skip if already attempted today (up to attemptsPerDay)
    const attemptsToday = await prisma.calloutAttempt.count({
      where: { calloutJobId: job.id, localDate: todayLocal },
    });
    if (attemptsToday >= schedule.attemptsPerDay) {
      result.skipped++;
      continue;
    }

    const attemptNumber = job.totalAttempts + 1;

    // Create attempt record
    const attempt = await prisma.calloutAttempt.create({
      data: {
        calloutJobId: job.id,
        attemptNumber,
        localDate: todayLocal,
        status: "QUEUED",
      },
    });

    try {
      const response = await triggerElisionCallout({
        addLeadUrl,
        accessToken,
        phoneNumber,
        listId,
        source,
        addToHopper,
        comments,
      });
      const responseJson = response as Prisma.InputJsonValue;

      await prisma.calloutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "TRIGGERED",
          requestedAt: new Date(),
          responseJson,
        },
      });

      result.triggered++;
      result.attemptIds.push(attempt.id);
    } catch (error) {
      await prisma.calloutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "FAILED",
          requestedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Elision error",
        },
      });
      result.failed++;
    }

    // Update job status
    const nextStatus =
      schedule.escalationEnabled && attemptNumber >= maxAttempts
        ? "ESCALATED"
        : job.status === "PENDING"
        ? "IN_PROGRESS"
        : job.status;

    await prisma.calloutJob.update({
      where: { id: job.id },
      data: {
        totalAttempts: attemptNumber,
        lastAttemptAt: new Date(),
        status: nextStatus,
      },
    });
  }

  return result;
};

/**
 * Full schedule run: fetch employees from Acengage, save to DB, then trigger callouts.
 */
const runSchedule = async (scheduleId: string): Promise<void> => {
  const schedule = await prisma.calloutSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      voiceAgent: { include: { voiceProfile: true } },
    },
  });

  if (!schedule || !schedule.isActive) return;

  const voiceProfile = schedule.voiceAgent.voiceProfile;
  const settingsJson = (voiceProfile?.settingsJson ?? {}) as Record<string, unknown>;
  const acengageConfig = {
    ...DEFAULT_ACENGAGE_CONFIG,
    ...(settingsJson.acengage as Record<string, unknown> | undefined),
  } as typeof DEFAULT_ACENGAGE_CONFIG;

  // Step 1: Fetch employees from Acengage
  let employees: Record<string, unknown>[] = [];
  let statusTree: unknown | null = null;

  try {
    const result = await fetchNcEmployees(acengageConfig.getUrl);
    employees = result.employees;
    statusTree = result.statusTree;
    console.log(`[callouts] Fetched ${employees.length} employees from Acengage`);
  } catch (error) {
    console.error("[callouts] Acengage fetch failed", error);
    return;
  }

  // Update status tree in settings
  if (statusTree !== null && voiceProfile) {
    await prisma.voiceProfile.update({
      where: { voiceAgentId: schedule.voiceAgentId },
      data: {
        settingsJson: {
          ...(settingsJson ?? {}),
          acengage: { ...acengageConfig, statusTree },
        },
      },
    });
  }

  const pulledAt = new Date();
  const jobIds: string[] = [];

  // Step 2: Save/update CalloutJob records
  for (const employee of employees) {
    const employeeExternalId = safeExtractField(
      employee,
      acengageConfig.employeeIdField,
      ["id", "employee_id", "employeeId", "record_id"]
    );
    if (!employeeExternalId) continue;

    const employeePhone = safeExtractField(
      employee,
      acengageConfig.phoneField,
      ["mobile", "Mobile", "phone_number", "phone", "Phone", "contact_number", "phoneNumber"]
    );
    if (!employeePhone) continue;

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

    const employeeJson = employee as Prisma.InputJsonValue;

    const existingJob = await prisma.calloutJob.findFirst({
      where: { voiceAgentId: schedule.voiceAgentId, employeeExternalId },
    });

    if (existingJob) {
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
    } else {
      const newJob = await prisma.calloutJob.create({
        data: {
          voiceAgentId: schedule.voiceAgentId,
          employeeExternalId,
          employeeName,
          employeePhone,
          employeeCompany,
          employeeJson,
          pulledAt,
        },
      });
      jobIds.push(newJob.id);
    }
  }

  console.log(`[callouts] Saved ${jobIds.length} jobs, now triggering callouts...`);

  // Step 3: Trigger callouts for all saved jobs
  const triggerResult = await triggerCalloutsForVoiceAgent(schedule.voiceAgentId, { jobIds });
  console.log(
    `[callouts] Trigger result: ${triggerResult.triggered} triggered, ${triggerResult.failed} failed, ${triggerResult.skipped} skipped`
  );
};

export const runSchedulesOnce = async (): Promise<void> => {
  const schedules = await prisma.calloutSchedule.findMany({
    where: { isActive: true },
  });

  for (const schedule of schedules) {
    if (!shouldRunSchedule(schedule)) continue;
    await prisma.calloutSchedule.update({
      where: { id: schedule.id },
      data: { lastRunAt: new Date() },
    });
    await runSchedule(schedule.id);
  }
};

export const startCalloutScheduler = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: SchedulerHandle;
  };

  if (globalScope[GLOBAL_KEY]) return;

  const intervalId = setInterval(() => {
    runSchedulesOnce().catch((error) => {
      console.error("[callouts] Scheduler error", error);
    });
  }, POLL_INTERVAL_MS);

  globalScope[GLOBAL_KEY] = { intervalId };
};
