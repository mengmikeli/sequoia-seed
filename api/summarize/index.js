// Azure Functions (Static Web Apps API) - Node.js

async function callAzureOpenAI({ endpoint, apiKey, deployment, apiVersion, messages }) {
  const url =
    `${endpoint.replace(/\/+$/, "")}` +
    `/openai/deployments/${encodeURIComponent(deployment)}` +
    `/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;

  const body = {
    messages: messages,
    temperature: 0.3,
    max_tokens: 500
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json();

  if (!resp.ok) {
    const err = {
      status: resp.status,
      message: data?.error?.message || "Azure OpenAI call failed",
      data
    };
    throw new Error(JSON.stringify(err));
  }

  const text = data?.choices?.[0]?.message?.content ?? "";

  // Extract system prompt and user prompt from messages for response metadata
  const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
  const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.content || '';

  return {
    summary: text.trim(),
    systemPrompt: systemPrompt,
    userPrompt: lastUserMessage,
    conversationLength: messages.length
  };
}

module.exports = async function (context, req) {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";

    if (!endpoint || !apiKey || !deployment) {
      context.res = {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: {
          error:
            "Server is missing configuration. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_DEPLOYMENT."
        }
      };
      return;
    }

    // Support both conversation mode (messages array) and legacy mode (text string)
    let messages;

    if (req.body && req.body.messages && Array.isArray(req.body.messages)) {
      // New conversation mode: accept messages array directly
      messages = req.body.messages;
    } else {
      // Legacy mode: convert single text input to messages array
      const inputText = (req.body && req.body.text) ? String(req.body.text) : "";
      if (!inputText.trim()) {
        context.res = {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: { error: "Missing 'text' or 'messages' in request body." }
        };
        return;
      }

      const systemPrompt = "You are a browser-embedded AI assistant. Summarize accurately and concisely. Prefer bullet points. If info is missing, say so.";
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: inputText }
      ];
    }

    const result = await callAzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion,
      messages
    });

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result
    };
  } catch (e) {
    context.log("summarize error:", e?.message || e);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: { error: "Summarization failed.", detail: String(e?.message || e) }
    };
  }
};
