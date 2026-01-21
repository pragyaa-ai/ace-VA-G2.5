import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Check if USV Exit Interview Scheduler already exists
  const existing = await prisma.voiceAgent.findFirst({
    where: { name: "USV Exit Interview Scheduler" },
  });

  if (existing) {
    console.log("USV Exit Interview Scheduler already exists:", existing.id);
    return;
  }

  // Create USV Exit Interview Scheduler with default configuration
  const usvVoiceAgent = await prisma.voiceAgent.create({
    data: {
      name: "USV Exit Interview Scheduler",
      phoneNumber: "+91 9876543210",
      engine: "PRIMARY",
      greeting:
        "Hello. This call is from AceNgage on behalf of USV. We would like to schedule your exit interview with an HR counsellor. May I take a few moments to find a convenient time for you?",
      accent: "INDIAN",
      language: "ENGLISH",
      voiceName: "KAVYA",
      isActive: true,
    },
  });

  console.log("Created USV Exit Interview Scheduler:", usvVoiceAgent.id);

  await prisma.calloutSchedule.create({
    data: {
      voiceAgentId: usvVoiceAgent.id,
      runAtLocalTime: "11:00",
      timezone: "Asia/Kolkata",
      attemptsPerDay: 3,
      maxDays: 2,
      escalationEnabled: true,
    },
  });

  await prisma.voiceProfile.create({
    data: {
      voiceAgentId: usvVoiceAgent.id,
      voiceName: "KAVYA",
      accentNotes: "Acengage callout + telephony settings",
      settingsJson: {
        acengage: {
          getUrl: "https://api-app.acengage.com/campaign/bot/get_nc_employees/1",
          updateUrlTemplate:
            "https://api-app.acengage.com/campaign/bot/update_nc_schedule/{employeeId}",
          employeeIdField: "id",
          phoneField: "phone_number",
        },
        telephony: {
          provider: "ELISION",
          wsUrl: "ws://0.0.0.0:8083/wsAcengage",
          sampleRateInput: 8000,
          sampleRateOutput: 8000,
          audioFormat: "PCM_INT16",
          bufferSizeMs: 200,
          connectionTimeoutMs: 30000,
          reconnectAttempts: 3,
          reconnectDelayMs: 1000,
          authUrl: "https://webrtc.elisiontec.com/api/login",
          addLeadUrl: "https://webrtc.elisiontec.com/api/add-lead",
          username: "ACESUP",
          password: "",
          listId: "250707112431",
          source: "Bot",
          addToHopper: "Y",
          commentsTemplate: "wss://acengageva.pragyaa.ai/wsAcengage?phone=elision",
          accessToken: "",
        },
      },
    },
  });

  // Add default call flow
  await prisma.callFlow.create({
    data: {
      voiceAgentId: usvVoiceAgent.id,
      greeting:
        "Hello. This call is from AceNgage on behalf of USV. We would like to schedule your exit interview with an HR counsellor. May I take a few moments to find a convenient time for you?",
      steps: {
        create: [
          {
            order: 0,
            title: "Confirm Purpose",
            content:
              "Explain the exit interview purpose if asked and confirm they are okay to proceed.",
            enabled: true,
          },
          {
            order: 1,
            title: "Collect Date & Time",
            content:
              "Ask for the preferred date and time for the exit interview (together).",
            enabled: true,
          },
          {
            order: 2,
            title: "Confirm Availability",
            content:
              "Confirm the date and time back to the caller and check acceptance.",
            enabled: true,
          },
          {
            order: 3,
            title: "Close & Handoff",
            content:
              "Confirm the HR counsellor will call at the scheduled time and end politely.",
            enabled: true,
          },
        ],
      },
    },
  });

  // Add default guardrails
  await prisma.guardrail.createMany({
    data: [
      {
        voiceAgentId: usvVoiceAgent.id,
        name: "No Sensitive Data",
        description: "Avoid collecting sensitive or personal data",
        ruleText:
          "Do not ask for or accept passwords, OTPs, credit card details, or other sensitive information. If requested, offer a human follow-up.",
        enabled: true,
      },
      {
        voiceAgentId: usvVoiceAgent.id,
        name: "No Commitments",
        description: "Avoid making guarantees or policy commitments",
        ruleText:
          "Do not promise outcomes, policy changes, or confidentiality terms beyond the standard exit interview process.",
        enabled: true,
      },
      {
        voiceAgentId: usvVoiceAgent.id,
        name: "Respect Objections",
        description: "End call politely on refusal",
        ruleText:
          "If the caller refuses or asks not to be contacted, acknowledge and end the call immediately.",
        enabled: true,
      },
    ],
  });

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



