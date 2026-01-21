type ElisionCalloutInput = {
  addLeadUrl: string;
  accessToken: string;
  phoneNumber: string;
  listId: string;
  source: string;
  addToHopper: string;
  comments: string;
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
