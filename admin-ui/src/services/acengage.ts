type AcengageFetchResult = {
  employees: Record<string, unknown>[];
  statusTree: unknown | null;
  raw: unknown;
};

type UpdateNcScheduleInput = {
  updateUrlTemplate: string;
  employeeId: string;
  callbackDate?: string;
  callbackTime?: string;
  nonContactableStatusNodeId?: number;
  notes?: string;
};

const EMPLOYEE_ARRAY_KEYS = ["employees", "data", "records", "results"];
const STATUS_TREE_KEYS = ["status_tree", "statusTree", "status_nodes", "statusNodes"];

const extractArray = (raw: unknown): Record<string, unknown>[] => {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    for (const key of EMPLOYEE_ARRAY_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as Record<string, unknown>[];
    }
  }
  return [];
};

const extractStatusTree = (raw: unknown): unknown | null => {
  if (raw && typeof raw === "object") {
    for (const key of STATUS_TREE_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      if (value !== undefined) return value;
    }
  }
  return null;
};

const buildUpdateUrl = (template: string, employeeId: string): string => {
  if (template.includes("{employeeId}")) {
    return template.replace("{employeeId}", encodeURIComponent(employeeId));
  }
  if (template.endsWith("/")) return `${template}${encodeURIComponent(employeeId)}`;
  return `${template}/${encodeURIComponent(employeeId)}`;
};

export const fetchNcEmployees = async (url: string): Promise<AcengageFetchResult> => {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`Acengage GET failed (${res.status})`);
  }
  const raw = (await res.json()) as unknown;
  return {
    employees: extractArray(raw),
    statusTree: extractStatusTree(raw),
    raw,
  };
};

export const updateNcSchedule = async (input: UpdateNcScheduleInput): Promise<unknown> => {
  const url = buildUpdateUrl(input.updateUrlTemplate, input.employeeId);
  const payload: Record<string, unknown> = {};
  if (input.callbackDate) payload.callback_date = input.callbackDate;
  if (input.callbackTime) payload.callback_time = input.callbackTime;
  if (input.nonContactableStatusNodeId !== undefined) {
    payload.non_contactable_status_node_id = input.nonContactableStatusNodeId;
  }
  if (input.notes) payload.notes = input.notes;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Acengage POST failed (${res.status})`);
  }
  return res.json();
};
