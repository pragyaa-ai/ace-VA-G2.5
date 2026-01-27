import fs from "fs/promises";
import path from "path";

import { ensureTranscriptDirectories, TranscriptPayload } from "./storage";
import { processTranscriptPayload } from "./processor";

type QueueHandle = {
  intervalId: ReturnType<typeof setInterval>;
};

type QueueEntry = {
  call_id: string;
  transcript_file: string;
  status: "pending" | "processing" | "completed" | "failed";
  created_at?: string;
  processing_started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  result_file?: string;
};

const GLOBAL_KEY = "__voiceagentTranscriptQueue";
const POLL_INTERVAL_MS = 5_000;

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
};

const writeJsonFile = async (filePath: string, data: unknown): Promise<void> => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const getDataPointStatus = (value: unknown, confidence: number | null): string => {
  if (!value) return "not_captured";
  if (confidence === null || confidence === undefined) return "captured";
  if (confidence >= 0.9) return "verified";
  if (confidence >= 0.7) return "captured";
  if (confidence >= 0.5) return "captured";
  return "needs_to_be_validated";
};

const getOverallCallStatus = (extractedData: Record<string, unknown> | null): string => {
  if (!extractedData) return "incomplete";
  const hasName = Boolean(extractedData.full_name);
  const hasModel = Boolean(extractedData.car_model);
  const hasEmail = Boolean(extractedData.email_id);

  if (hasName && hasModel && hasEmail) return "complete";
  if (hasName || hasModel || hasEmail) return "partial";
  return "incomplete";
};

const inferDataType = (questionText: string): string => {
  if (/name/i.test(questionText)) return "full_name";
  if (/car|model|vehicle/i.test(questionText)) return "car_model";
  if (/email|mail/i.test(questionText)) return "email_id";
  return "other";
};

const enhanceQuestionAnswerPairs = (
  conversation: Array<{ speaker: string; text: string; timestamp: string }>
): Array<Record<string, unknown>> => {
  const pairs: Array<Record<string, unknown>> = [];

  for (let i = 0; i < conversation.length - 1; i += 1) {
    const current = conversation[i];
    const next = conversation[i + 1];
    if (current.speaker === "assistant" && next.speaker === "user") {
      const questionTime = new Date(current.timestamp).getTime();
      const answerTime = new Date(next.timestamp).getTime();
      pairs.push({
        question: current.text,
        answer: next.text,
        question_timestamp: current.timestamp,
        answer_timestamp: next.timestamp,
        question_duration: current.text.length * 50,
        answer_duration: answerTime - questionTime,
        total_duration: answerTime - questionTime,
        data_type: inferDataType(current.text),
        reattempts: 0,
      });
    }
  }

  return pairs;
};

const extractTimestamps = (
  conversation: Array<{ text: string; timestamp: string }>,
  dataType: string
): { first_attempt: number | null; last_attempt: number | null; verified_at: number | null } => {
  const relatedEntries = conversation.filter((entry) => {
    if (!entry.text) return false;
    if (dataType === "full_name") return /name|my name is|i am|this is/i.test(entry.text);
    if (dataType === "car_model")
      return /car|model|vehicle|toyota|honda|ford|mahindra/i.test(entry.text);
    if (dataType === "email_id") return /email|mail|gmail|yahoo|hotmail|@/i.test(entry.text);
    return false;
  });

  return {
    first_attempt: relatedEntries.length
      ? new Date(relatedEntries[0].timestamp).getTime()
      : null,
    last_attempt: relatedEntries.length
      ? new Date(relatedEntries[relatedEntries.length - 1].timestamp).getTime()
      : null,
    verified_at: null,
  };
};

const saveProcessingResult = async ({
  callId,
  queueData,
  transcriptData,
  result,
  resultsDir,
}: {
  callId: string;
  queueData: QueueEntry;
  transcriptData: TranscriptPayload & { conversation?: Array<{ speaker: string; text: string; timestamp: string }> };
  result: Awaited<ReturnType<typeof processTranscriptPayload>>;
  resultsDir: string;
}): Promise<string> => {
  const timestamp = Date.now();
  const resultFilename = `call_${callId}_${timestamp}_result.json`;
  const resultPath = path.join(resultsDir, resultFilename);

  const analytics = transcriptData.analytics ?? {
    total_exchanges: 0,
    user_messages: 0,
    assistant_messages: 0,
    question_answer_pairs: 0,
    parameters_attempted: [],
    parameters_captured: [],
    drop_off_point: null,
  };
  const conversation = transcriptData.conversation ?? [];

  const extractedData =
    (result.extracted_data as Record<string, unknown> | undefined) ?? null;

  const resultData = {
    call_id: callId,
    processed_at: new Date().toISOString(),
    success: result.success,
    extracted_data: {
      ...extractedData,
      data_points: {
        full_name: {
          value: extractedData?.full_name ?? null,
          status: getDataPointStatus(
            extractedData?.full_name,
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.name_confidence ?? null
          ),
          confidence:
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.name_confidence ?? 0,
          attempts: analytics.parameters_attempted?.includes("full_name") ? 1 : 0,
          timestamps: extractTimestamps(conversation, "full_name"),
        },
        car_model: {
          value: extractedData?.car_model ?? null,
          status: getDataPointStatus(
            extractedData?.car_model,
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.car_confidence ?? null
          ),
          confidence:
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.car_confidence ?? 0,
          attempts: analytics.parameters_attempted?.includes("car_model") ? 1 : 0,
          timestamps: extractTimestamps(conversation, "car_model"),
        },
        email_id: {
          value: extractedData?.email_id ?? null,
          status: getDataPointStatus(
            extractedData?.email_id,
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.email_confidence ?? null
          ),
          confidence:
            (extractedData?.confidence_scores as Record<string, number> | undefined)
              ?.email_confidence ?? 0,
          attempts: analytics.parameters_attempted?.includes("email_id") ? 1 : 0,
          timestamps: extractTimestamps(conversation, "email_id"),
        },
      },
      overall_status: getOverallCallStatus(extractedData),
    },
    call_analytics: {
      call_length: transcriptData.call_duration ?? 0,
      call_start_time: transcriptData.call_start_time ?? null,
      call_end_time: transcriptData.call_end_time ?? null,
      question_answer_pairs: enhanceQuestionAnswerPairs(conversation),
      total_parameters_attempted: analytics.parameters_attempted?.length ?? 0,
      total_parameters_captured: analytics.parameters_captured?.length ?? 0,
      parameters_attempted: analytics.parameters_attempted ?? [],
      parameters_captured: analytics.parameters_captured ?? [],
      drop_off_point: analytics.drop_off_point ?? null,
      total_exchanges: analytics.total_exchanges ?? 0,
      user_messages: analytics.user_messages ?? 0,
      assistant_messages: analytics.assistant_messages ?? 0,
    },
    processing: {
      method: result.processing_metadata?.processing_method ?? "openai_agents_sdk_full_context",
      conversation_entries: result.processing_metadata?.conversation_entries ?? 0,
      conversation_length: result.processing_metadata?.conversation_length ?? 0,
      processing_time_ms: result.processing_metadata?.processing_time_ms ?? null,
      transcript_file: queueData.transcript_file,
      started_at: queueData.processing_started_at ?? null,
      completed_at: new Date().toISOString(),
    },
  };

  await writeJsonFile(resultPath, resultData);
  return resultFilename;
};

const processQueueEntry = async (
  queueFile: string,
  dirs: Awaited<ReturnType<typeof ensureTranscriptDirectories>>
): Promise<void> => {
  const queuePath = path.join(dirs.processingDir, queueFile);
  let queueData = await readJsonFile<QueueEntry>(queuePath);

  if (queueData.status !== "pending") return;

  queueData = {
    ...queueData,
    status: "processing",
    processing_started_at: new Date().toISOString(),
  };
  await writeJsonFile(queuePath, queueData);

  const transcriptPath = path.join(dirs.transcriptsDir, queueData.transcript_file);

  try {
    const transcriptData = await readJsonFile<TranscriptPayload>(transcriptPath);
    const result = await processTranscriptPayload(transcriptData);

    if (!result.success) {
      queueData = {
        ...queueData,
        status: "failed",
        failed_at: new Date().toISOString(),
        error: result.error ?? "Transcript processing failed",
      };
      await writeJsonFile(queuePath, queueData);
      return;
    }

    const resultFilename = await saveProcessingResult({
      callId: queueData.call_id,
      queueData,
      transcriptData,
      result,
      resultsDir: dirs.resultsDir,
    });

    queueData = {
      ...queueData,
      status: "completed",
      completed_at: new Date().toISOString(),
      result_file: resultFilename,
    };
    await writeJsonFile(queuePath, queueData);
  } catch (error) {
    queueData = {
      ...queueData,
      status: "failed",
      failed_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Transcript processing failed",
    };
    await writeJsonFile(queuePath, queueData);
  }
};

const processQueue = async (): Promise<void> => {
  const dirs = await ensureTranscriptDirectories();
  let queueFiles: string[] = [];

  try {
    queueFiles = (await fs.readdir(dirs.processingDir))
      .filter((file) => file.endsWith("_queue.json"))
      .sort();
  } catch (error) {
    console.error("[transcripts] Failed to read queue directory", error);
    return;
  }

  for (const queueFile of queueFiles) {
    await processQueueEntry(queueFile, dirs);
  }
};

export const startTranscriptQueueProcessor = (): void => {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: QueueHandle;
  };

  if (globalScope[GLOBAL_KEY]) return;

  const intervalId = setInterval(() => {
    processQueue().catch((error) => {
      console.error("[transcripts] Queue processing error", error);
    });
  }, POLL_INTERVAL_MS);

  globalScope[GLOBAL_KEY] = { intervalId };

  processQueue().catch((error) => {
    console.error("[transcripts] Initial queue processing error", error);
  });
};
