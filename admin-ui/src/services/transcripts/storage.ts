import fs from "fs/promises";
import path from "path";

export type TranscriptSpeaker = "assistant" | "user" | "system" | string;

export type TranscriptEntry = {
  timestamp: string;
  speaker: TranscriptSpeaker;
  text: string;
  confidence?: number | null;
  event_type?: string | null;
};

export type TranscriptAnalytics = {
  total_exchanges: number;
  user_messages: number;
  assistant_messages: number;
  question_answer_pairs: number;
  parameters_attempted: string[];
  parameters_captured: string[];
  drop_off_point: string | null;
};

export type TranscriptPayload = {
  call_id: string;
  timestamp?: string;
  call_start_time?: number | null;
  call_end_time?: number | null;
  call_duration?: number | null;
  conversation?: TranscriptEntry[];
  simple_transcripts?: string[];
  current_sales_data?: Record<string, unknown>;
  analytics?: Partial<TranscriptAnalytics>;
};

export type SavedTranscript = {
  dataDir: string;
  transcriptFile: string;
  transcriptPath: string;
  queueFile: string;
  queuePath: string;
};

const resolveDataDir = (): string => {
  if (process.env.VOICEAGENT_DATA_DIR) {
    return process.env.VOICEAGENT_DATA_DIR;
  }

  const cwd = process.cwd();
  const parentData = path.resolve(cwd, "..", "data");
  if (cwd.endsWith(path.sep + "admin-ui")) {
    return parentData;
  }

  return path.resolve(cwd, "data");
};

const ensureDir = async (dir: string): Promise<void> => {
  await fs.mkdir(dir, { recursive: true });
};

const computeAnalytics = (conversation: TranscriptEntry[]): TranscriptAnalytics => {
  const userMessages = conversation.filter((entry) => entry.speaker === "user").length;
  const assistantMessages = conversation.filter((entry) => entry.speaker === "assistant").length;
  let questionAnswerPairs = 0;

  for (let i = 0; i < conversation.length - 1; i += 1) {
    const current = conversation[i];
    const next = conversation[i + 1];
    if (current.speaker === "assistant" && next.speaker === "user") {
      questionAnswerPairs += 1;
    }
  }

  return {
    total_exchanges: conversation.length,
    user_messages: userMessages,
    assistant_messages: assistantMessages,
    question_answer_pairs: questionAnswerPairs,
    parameters_attempted: [],
    parameters_captured: [],
    drop_off_point: null,
  };
};

const normalizeSimpleTranscripts = (conversation: TranscriptEntry[]): string[] => {
  return conversation
    .filter((entry) => entry.speaker === "user" && entry.text)
    .map((entry) => entry.text);
};

export const saveTranscriptToDisk = async (
  payload: TranscriptPayload
): Promise<SavedTranscript> => {
  const dataDir = resolveDataDir();
  const transcriptsDir = path.join(dataDir, "transcripts");
  const processingDir = path.join(dataDir, "processing");

  await ensureDir(transcriptsDir);
  await ensureDir(processingDir);

  const now = Date.now();
  const transcriptFile = `call_${payload.call_id}_${now}.json`;
  const transcriptPath = path.join(transcriptsDir, transcriptFile);

  const conversation = payload.conversation ?? [];
  const analytics = {
    ...computeAnalytics(conversation),
    ...(payload.analytics ?? {}),
  };

  const transcriptData = {
    call_id: payload.call_id,
    timestamp: payload.timestamp ?? new Date().toISOString(),
    call_start_time: payload.call_start_time ?? null,
    call_end_time: payload.call_end_time ?? null,
    call_duration: payload.call_duration ?? null,
    conversation,
    simple_transcripts:
      payload.simple_transcripts ?? normalizeSimpleTranscripts(conversation),
    current_sales_data: payload.current_sales_data ?? {
      full_name: null,
      car_model: null,
      email_id: null,
      verified_fields: [],
      processing_status: "pending",
    },
    analytics,
  };

  await fs.writeFile(transcriptPath, JSON.stringify(transcriptData, null, 2), "utf8");

  const queueFile = `call_${payload.call_id}_${now}_queue.json`;
  const queuePath = path.join(processingDir, queueFile);
  const queueData = {
    call_id: payload.call_id,
    transcript_file: transcriptFile,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  await fs.writeFile(queuePath, JSON.stringify(queueData, null, 2), "utf8");

  return { dataDir, transcriptFile, transcriptPath, queueFile, queuePath };
};

export const ensureTranscriptDirectories = async (): Promise<{
  dataDir: string;
  transcriptsDir: string;
  processingDir: string;
  resultsDir: string;
}> => {
  const dataDir = resolveDataDir();
  const transcriptsDir = path.join(dataDir, "transcripts");
  const processingDir = path.join(dataDir, "processing");
  const resultsDir = path.join(dataDir, "results");

  await ensureDir(transcriptsDir);
  await ensureDir(processingDir);
  await ensureDir(resultsDir);

  return { dataDir, transcriptsDir, processingDir, resultsDir };
};
