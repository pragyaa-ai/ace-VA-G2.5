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

    console.log(`[elision] 🔐 Getting token from: ${authUrl}`);

    const res = await fetch(authUrl, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[elision] ❌ Auth failed (${res.status}): ${text}`);
      return { success: false, error: `Auth failed (${res.status}): ${text}` };
    }

    const data = await res.json();
    console.log(`[elision] 🔐 Auth response keys: ${Object.keys(data).join(", ")}`);
    
    // Elision returns token in different formats - check common patterns
    const token = data.token || data.access_token || data.data?.token || data.data?.access_token;
    
    if (!token) {
      console.error(`[elision] ❌ No token found in response: ${JSON.stringify(data).slice(0, 200)}`);
      return { success: false, error: "No token in response" };
    }

    console.log(`[elision] ✅ Token obtained (length: ${String(token).length})`);
    return { success: true, token: String(token) };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[elision] ❌ Auth error: ${errorMsg}`);
    return { success: false, error: errorMsg };
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

    console.log(`[elision] 📞 Triggering call to ${input.phoneNumber}`);
    console.log(`[elision] 📋 Request params: listId=${input.listId}, source=${input.source}, addToHopper=${input.addToHopper}`);
    console.log(`[elision] 🔗 URL: ${input.addLeadUrl}`);

    const res = await fetch(input.addLeadUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      body: form,
    });

    const responseText = await res.text();
    console.log(`[elision] 📨 Response status: ${res.status}`);
    console.log(`[elision] 📨 Response body: ${responseText}`);

    if (!res.ok) {
      return { success: false, error: `Add-lead failed (${res.status}): ${responseText}` };
    }

    // Try to parse as JSON
    let response: unknown;
    try {
      response = JSON.parse(responseText);
    } catch {
      response = { raw: responseText };
    }

    console.log(`[elision] ✅ Call triggered successfully`);
    return { success: true, response };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[elision] ❌ Error: ${errorMsg}`);
    return { success: false, error: errorMsg };
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
