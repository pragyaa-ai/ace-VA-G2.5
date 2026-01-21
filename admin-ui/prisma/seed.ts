import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Check if Kia VoiceAgent already exists
  const existing = await prisma.voiceAgent.findFirst({
    where: { name: "Kia VoiceAgent" },
  });

  if (existing) {
    console.log("Kia VoiceAgent already exists:", existing.id);
    return;
  }

  // Create Kia VoiceAgent with default configuration
  const kiaVoiceAgent = await prisma.voiceAgent.create({
    data: {
      name: "Kia VoiceAgent",
      phoneNumber: "+91 9876543210",
      engine: "PRIMARY",
      greeting:
        "Namaste! Welcome to Kia Motors. I'm Ananya, your sales assistant. How can I help you today?",
      accent: "INDIAN",
      language: "ENGLISH",
      voiceName: "ANANYA",
      isActive: true,
    },
  });

  console.log("Created Kia VoiceAgent:", kiaVoiceAgent.id);

  // Add default call flow
  await prisma.callFlow.create({
    data: {
      voiceAgentId: kiaVoiceAgent.id,
      greeting:
        "Namaste! Welcome to Kia Motors. I'm Ananya, your sales assistant. How can I help you today?",
      steps: {
        create: [
          {
            order: 0,
            title: "Collect Name",
            content: "Ask for the customer's name in a friendly manner.",
            enabled: true,
          },
          {
            order: 1,
            title: "Identify Interest",
            content:
              "Ask which Kia model they're interested in (Seltos, Sonet, Carens, EV6).",
            enabled: true,
          },
          {
            order: 2,
            title: "Collect Contact",
            content: "Request their phone number for follow-up by the sales team.",
            enabled: true,
          },
          {
            order: 3,
            title: "Schedule Test Drive",
            content: "Offer to schedule a test drive at their nearest dealership.",
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
        voiceAgentId: kiaVoiceAgent.id,
        name: "No Competitor Comparisons",
        description: "Avoid comparing Kia cars to competitors",
        ruleText:
          "Never compare Kia vehicles to competitors like Hyundai, Tata, or Maruti. Focus only on Kia's features and benefits.",
        enabled: true,
      },
      {
        voiceAgentId: kiaVoiceAgent.id,
        name: "No Pricing Commitments",
        description: "Don't commit to specific prices",
        ruleText:
          "Do not commit to specific prices or discounts. Direct pricing questions to the dealership.",
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



