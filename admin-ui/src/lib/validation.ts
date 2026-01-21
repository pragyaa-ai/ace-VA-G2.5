import { z } from "zod";

// Voice name mapping (display name → internal name)
export const VOICE_NAMES = {
  ANANYA: "Ananya",
  PRIYA: "Priya",
  CHITRA: "Chitra",
  KAVYA: "Kavya",
  FARHAN: "Farhan",
} as const;

export const ACCENTS = {
  INDIAN: "Indian",
  AMERICAN: "American",
  BRITISH: "British",
} as const;

export const LANGUAGES = {
  ENGLISH: "English",
  HINDI: "Hindi",
} as const;

export const ENGINE_LABELS = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
} as const;

// ---------- VoiceAgent ----------
export const createVoiceAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phoneNumber: z.string().optional(),
  engine: z.enum(["PRIMARY", "SECONDARY"]).default("PRIMARY"),
  greeting: z
    .string()
    .min(1, "Greeting is required")
    .max(500)
    .default(
      "Hello. This call is from AceNgage on behalf of USV. We would like to schedule your exit interview with an HR counsellor. May I take a few moments to find a convenient time for you?"
    ),
  accent: z.enum(["INDIAN", "AMERICAN", "BRITISH"]).default("INDIAN"),
  language: z.enum(["ENGLISH", "HINDI"]).default("ENGLISH"),
  voiceName: z.enum(["ANANYA", "PRIYA", "CHITRA", "KAVYA", "FARHAN"]).default("ANANYA"),
  isActive: z.boolean().default(true),
});

export type CreateVoiceAgentInput = z.infer<typeof createVoiceAgentSchema>;

// ---------- Call Flow ----------
export const updateCallFlowSchema = z.object({
  greeting: z.string().min(1, "Greeting is required").max(2000),
  steps: z
    .array(
      z.object({
        id: z.string().optional(),
        order: z.number().int().min(0),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(5000),
        enabled: z.boolean().default(true),
      })
    )
    .optional(),
});

export type UpdateCallFlowInput = z.infer<typeof updateCallFlowSchema>;

// ---------- Guardrail ----------
export const createGuardrailSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  ruleText: z.string().min(1, "Rule text is required").max(2000),
  enabled: z.boolean().default(true),
});

export type CreateGuardrailInput = z.infer<typeof createGuardrailSchema>;

// ---------- Voice Profile ----------
export const upsertVoiceProfileSchema = z.object({
  voiceName: z.string().min(1).max(50),
  accentNotes: z.string().max(1000).optional(),
  settingsJson: z.any().optional(),
});

export type UpsertVoiceProfileInput = z.infer<typeof upsertVoiceProfileSchema>;

// ---------- Callout Config ----------
export const updateCalloutScheduleSchema = z.object({
  isActive: z.boolean(),
  runAtLocalTime: z.string().min(1).max(10),
  timezone: z.string().min(1).max(50),
  attemptsPerDay: z.number().int().min(1).max(10),
  maxDays: z.number().int().min(1).max(14),
  escalationEnabled: z.boolean(),
});

export const updateAcengageConfigSchema = z.object({
  getUrl: z.string().url(),
  updateUrlTemplate: z.string().min(1).max(500),
  employeeIdField: z.string().min(1).max(100),
  phoneField: z.string().min(1).max(100),
});

export const updateCalloutConfigSchema = z.object({
  schedule: updateCalloutScheduleSchema,
  acengage: updateAcengageConfigSchema,
});

export type UpdateCalloutConfigInput = z.infer<typeof updateCalloutConfigSchema>;

// ---------- Callout Outcome ----------
export const updateCalloutOutcomeSchema = z.object({
  callbackDate: z.string().optional(),
  callbackTime: z.string().optional(),
  nonContactableStatusNodeId: z.number().int().optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateCalloutOutcomeInput = z.infer<typeof updateCalloutOutcomeSchema>;

// ---------- Feedback ----------
export const createFeedbackSchema = z.object({
  voiceAgentId: z.string().optional(),
  source: z.string().max(50).default("testing"),
  message: z.string().min(1, "Feedback message is required").max(5000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
