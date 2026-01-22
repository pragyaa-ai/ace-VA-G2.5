type ElisionCalloutInput = {
  addLeadUrl: string;
  accessToken: string;
  phoneNumber: string;
  listId: string;
  source: string;
  addToHopper: string;
  comments: string;
};

type ElisionTokenResult = {
  success: boolean;
  token?: string;
  error?: string;
};

type ElisionCallResult = {
  success: boolean;
  response?: unknown;
  error?: string;
};

type TriggerElisionCallInput = {
  addLeadUrl: string;
  token: string;
  phoneNumber: string;
  listId: string;
  source: string;
  addToHopper: string;
  comments: string;
};

export const getElisionToken = async (
  authUrl: string,
  username: string,
  password: string
): Promise<ElisionTokenResult> => {
  try {
    const form = new FormData();
    form.append("user", username);
    form.append("password", password);

    const res = await fetch(authUrl, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      return { success: false, error: `Auth failed (${res.status})` };
    }

    const data = await res.json();
    // Elision returns token in different formats - check common patterns
    const token = data.token || data.access_token || data.data?.token || data.data?.access_token;
    
    if (!token) {
      return { success: false, error: "No token in response" };
    }

    return { success: true, token: String(token) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
};

export const triggerElisionCall = async (input: TriggerElisionCallInput): Promise<ElisionCallResult> => {
  try {
    const form = new FormData();
    form.append("phone_number", input.phoneNumber);
    form.append("list_id", input.listId);
    form.append("source", input.source);
    form.append("add_to_hopper", input.addToHopper);
    form.append("comments", input.comments);

    const res = await fetch(input.addLeadUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Add-lead failed (${res.status}): ${text}` };
    }

    const response = await res.json();
    return { success: true, response };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
};

export const triggerElisionCallout = async (input: ElisionCalloutInput): Promise<unknown> => {
  const form = new FormData();
  form.append("phone_number", input.phoneNumber);
  form.append("list_id", input.listId);
  form.append("source", input.source);
  form.append("add_to_hopper", input.addToHopper);
  form.append("comments", input.comments);

  const res = await fetch(input.addLeadUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Elision add-lead failed (${res.status})`);
  }

  return res.json();
};
