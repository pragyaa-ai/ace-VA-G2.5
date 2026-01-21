import { prisma } from "@/lib/prisma";
import { DEFAULT_ACENGAGE_CONFIG } from "@/lib/callouts";
import { fetchNcEmployees } from "@/services/acengage";
import { triggerElisionCallout } from "@/services/elision";

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

const resolveEmployeeId = (employee: Record<string, unknown>, field: string): string | null => {
  return (
    safeString(employee[field]) ??
    safeString(employee.id) ??
    safeString(employee.employee_id) ??
    safeString(employee.employeeId) ??
    safeString(employee.record_id)
  );
};

const resolvePhoneNumber = (employee: Record<string, unknown>, field: string): string | null => {
  return (
    safeString(employee[field]) ??
    safeString(employee.phone_number) ??
    safeString(employee.phone) ??
    safeString(employee.mobile)
  );
};

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
  const telephonyConfig = (settingsJson.telephony ?? {}) as Record<string, unknown>;

  const addLeadUrl = safeString(telephonyConfig.addLeadUrl);
  const accessToken = safeString(telephonyConfig.accessToken);
  const listId = safeString(telephonyConfig.listId);
  const source = safeString(telephonyConfig.source) ?? "Bot";
  const addToHopper = safeString(telephonyConfig.addToHopper) ?? "Y";
  const comments = safeString(telephonyConfig.commentsTemplate);

  if (!addLeadUrl || !accessToken || !listId || !comments) {
    console.error("[callouts] Missing Elision telephony config", {
      voiceAgentId: schedule.voiceAgentId,
    });
    return;
  }

  let employees: Record<string, unknown>[] = [];
  let statusTree: unknown | null = null;

  try {
    const result = await fetchNcEmployees(acengageConfig.getUrl);
    employees = result.employees;
    statusTree = result.statusTree;
  } catch (error) {
    console.error("[callouts] Acengage fetch failed", error);
    return;
  }

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

  const todayLocal = getLocalDateString(new Date(), schedule.timezone);
  const maxAttempts = schedule.attemptsPerDay * schedule.maxDays;

  for (const employee of employees) {
    const employeeId = resolveEmployeeId(employee, acengageConfig.employeeIdField);
    if (!employeeId) continue;

    const phoneNumber = resolvePhoneNumber(employee, acengageConfig.phoneField);
    if (!phoneNumber) continue;

    const existingJob = await prisma.calloutJob.findFirst({
      where: { voiceAgentId: schedule.voiceAgentId, employeeExternalId: employeeId },
    });

    const job =
      existingJob ??
      (await prisma.calloutJob.create({
        data: {
          voiceAgentId: schedule.voiceAgentId,
          employeeExternalId: employeeId,
          employeeJson: employee,
        },
      }));

    if (existingJob) {
      await prisma.calloutJob.update({
        where: { id: existingJob.id },
        data: { employeeJson: employee },
      });
    }

    if (job.totalAttempts >= maxAttempts) {
      if (schedule.escalationEnabled && job.status !== "ESCALATED") {
        await prisma.calloutJob.update({
          where: { id: job.id },
          data: { status: "ESCALATED" },
        });
      }
      continue;
    }

    const attemptsToday = await prisma.calloutAttempt.count({
      where: { calloutJobId: job.id, localDate: todayLocal },
    });
    if (attemptsToday >= schedule.attemptsPerDay) continue;

    const attemptNumber = job.totalAttempts + 1;
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

      await prisma.calloutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "TRIGGERED",
          requestedAt: new Date(),
          responseJson: response,
        },
      });
    } catch (error) {
      await prisma.calloutAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "FAILED",
          requestedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Elision error",
        },
      });
    }

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
