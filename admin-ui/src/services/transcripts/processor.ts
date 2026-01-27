import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

import type { TranscriptPayload, TranscriptEntry } from "./storage";

type ExtractionResult = {
  success: boolean;
  call_id: string;
  extracted_data?: Record<string, unknown>;
  error?: string;
  processing_metadata?: Record<string, unknown>;
  raw_result?: unknown;
};

const extractCompleteDataTool = tool({
  name: "extract_complete_sales_data",
  description: "Extract sales data from a full conversation transcript with confidence scores.",
  parameters: z.object({
    full_name: z.string().nullable().describe("Customer's full name"),
    car_model: z.string().nullable().describe("Car model or brand they are interested in"),
    email_id: z.string().nullable().describe("Customer's email address"),
    phone_number: z.string().nullable().describe("Customer's phone number (optional)"),
    location: z.string().nullable().describe("Customer's location/city (optional)"),
    confidence_scores: z
      .object({
        name_confidence: z
          .number()
          .min(0)
          .max(1)
          .default(0.8)
          .describe("Confidence in name extraction"),
        car_confidence: z
          .number()
          .min(0)
          .max(1)
          .default(0.8)
          .describe("Confidence in car model extraction"),
        email_confidence: z
          .number()
          .min(0)
          .max(1)
          .default(0.8)
          .describe("Confidence in email extraction"),
      })
      .default({}),
    extraction_notes: z.string().nullable().optional().describe("Notes about any ambiguity"),
    conversation_quality: z
      .enum(["excellent", "good", "fair", "poor"])
      .default("good")
      .describe("Overall conversation quality"),
  }),
  execute: async (input) => {
    return {
      success: true,
      extracted_data: input,
      processed_at: new Date().toISOString(),
      processing_method: "openai_agents_sdk",
    };
  },
});

const fullContextAgent = new Agent({
  name: "FullContextTranscriptProcessor",
  instructions: `You are an expert sales data extraction agent analyzing COMPLETE call conversations.

CONTEXT: You receive the full conversation transcript with timestamps showing the entire customer interaction from start to finish.

TASK: Extract sales lead information with high accuracy by analyzing the complete conversation flow.

ANALYSIS APPROACH:
1. Read the entire conversation (not individual messages in isolation).
2. Identify patterns; customers often repeat or correct information.
3. Handle format variations like "name at gmail dot com" → "name@gmail.com".
4. Use context clues from later in the conversation.
5. Prioritize the latest information if corrected.
6. Assess confidence based on clarity and repetition.

EXTRACTION RULES:
- Name: Look for "My name is...", "I am...", "This is..." patterns.
- Email: Handle "user@domain.com" and "user at domain dot com".
- Car Model: Extract specific models or brands.
- Corrections: Use the latest version if corrected.
- Confidence:
  - 0.9-1.0: Clear, repeated, or confirmed
  - 0.7-0.9: Clear but mentioned once
  - 0.5-0.7: Somewhat unclear but extractable
  - 0.3-0.5: Very unclear
  - 0.0-0.3: Not mentioned or unclear

CONVERSATION QUALITY:
- excellent: all data clear, good audio
- good: most data clear
- fair: some unclear responses
- poor: very unclear, unresponsive

Use the extract_complete_sales_data tool with your findings.`,
  tools: [extractCompleteDataTool],
});

const buildConversationText = (
  conversation: TranscriptEntry[] | undefined,
  simpleTranscripts: string[] | undefined
): string => {
  if (conversation && conversation.length > 0) {
    return conversation
      .map((entry) => `[${entry.timestamp}] ${entry.speaker.toUpperCase()}: ${entry.text}`)
      .join("\n");
  }

  if (simpleTranscripts && simpleTranscripts.length > 0) {
    return simpleTranscripts.join("\n");
  }

  throw new Error("No conversation data found in transcript file");
};

const extractToolOutput = (result: unknown): Record<string, unknown> | null => {
  const state = (result as { state?: { _generatedItems?: Array<Record<string, unknown>> } })
    .state;
  const generatedItems = state?._generatedItems ?? [];

  const toolCallOutput = generatedItems.find(
    (item) => item.type === "tool_call_output_item"
  ) as Record<string, unknown> | undefined;

  if (!toolCallOutput) return null;

  const rawOutput =
    (toolCallOutput.output as unknown) ??
    (toolCallOutput.rawItem as { output?: unknown } | undefined)?.output ??
    (toolCallOutput.rawItem as { output?: { text?: unknown } } | undefined)?.output?.text;

  if (!rawOutput) return null;

  if (typeof rawOutput === "string") {
    try {
      return JSON.parse(rawOutput) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  if (typeof rawOutput === "object") {
    return rawOutput as Record<string, unknown>;
  }

  return null;
};

export const processTranscriptPayload = async (
  payload: TranscriptPayload
): Promise<ExtractionResult> => {
  const startTime = Date.now();
  const callId = payload.call_id;

  try {
    const conversationText = buildConversationText(
      payload.conversation,
      payload.simple_transcripts
    );

    const agentPrompt = `Analyze this complete sales call conversation and extract all relevant customer information:

CONVERSATION TRANSCRIPT:
${conversationText}

Please extract all available sales data with confidence scores and provide notes about the conversation quality.`;

    const result = await run(fullContextAgent, agentPrompt);
    const toolOutput = extractToolOutput(result);
    const extractedData = (toolOutput?.extracted_data ?? null) as Record<string, unknown> | null;

    if (!toolOutput || !extractedData) {
      return {
        success: false,
        call_id: callId,
        error: "No extraction result found in agent response",
        processing_metadata: {
          processing_method: "openai_agents_sdk_full_context",
          processing_time_ms: Date.now() - startTime,
        },
        raw_result: result,
      };
    }

    return {
      success: true,
      call_id: callId,
      extracted_data: extractedData,
      processing_metadata: {
        processed_at: new Date().toISOString(),
        processing_method: "openai_agents_sdk_full_context",
        conversation_entries: payload.conversation?.length ?? 0,
        conversation_length: conversationText.length,
        processing_time_ms: Date.now() - startTime,
        tool_call_output: toolOutput,
        agent_result: result,
      },
    };
  } catch (error) {
    return {
      success: false,
      call_id: callId,
      error: error instanceof Error ? error.message : "Unknown processing error",
      processing_metadata: {
        processing_method: "openai_agents_sdk_full_context",
        processing_time_ms: Date.now() - startTime,
      },
    };
  }
};
