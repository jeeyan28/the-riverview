// AI-assisted forecast narrative.
//
// IMPORTANT DESIGN CHOICE: the AI never computes numbers. All figures (SMA,
// trend %, volatility, seasonality, anomalies, projections) are produced
// deterministically by forecastRoutes.js using simple-statistics — that is
// the "professional IT" part of this feature and it stays auditable and
// reproducible. The AI's only job is to read that pre-computed JSON and turn
// it into a short, well-written narrative (executive summary + concrete
// recommendations + risk flags) the way a business analyst would explain a
// dashboard to a manager. This keeps the feature grounded: the model cannot
// invent a number that isn't already in the payload we send it.
//
// Supports Google Gemini, OpenAI, or Anthropic as the provider — pick
// whichever you have a key for. If no key is configured, or the call fails
// for any reason, generateForecastNarrative resolves to `null` and the
// caller (forecastRoutes.js) falls back to the existing rule-based
// `insights` list — the page never breaks because of this feature.
//
// Provider selection:
//   - Set AI_PROVIDER=gemini / openai / anthropic explicitly, OR
//   - leave AI_PROVIDER unset and it auto-picks based on whichever key is
//     present, checked in this order: GEMINI_API_KEY, then OPENAI_API_KEY,
//     then ANTHROPIC_API_KEY. Gemini is checked first because Google AI
//     Studio issues it with a genuinely free, no-card-required rate-limited
//     tier — the other two require a paid balance.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

// Small/cheap models — this is a short summarization task over a compact
// JSON payload, not a task that needs a large reasoning model.
// gemini-2.5-flash-lite is tried first: it's historically had the most
// generous free-tier quota of the readily-available models. gemini-3-flash-preview
// is Google's other officially-recommended free-tier model but has shown a
// much tighter per-project quota (observed: 5 requests/minute) — kept as a
// fallback, not the default. See callGemini() for the full fallback chain.
const GEMINI_MODEL = process.env.AI_FORECAST_MODEL_GEMINI || "gemini-2.5-flash-lite";
const ANTHROPIC_MODEL = process.env.AI_FORECAST_MODEL_ANTHROPIC || "claude-haiku-4-5-20251001";
const OPENAI_MODEL = process.env.AI_FORECAST_MODEL_OPENAI || "gpt-5.6-luna";

const AI_MAX_TOKENS = 700;
const AI_TIMEOUT_MS = 12000;

const SYSTEM_PROMPT = `You are a business analyst writing a short forecast briefing for a facility-booking company's admin dashboard.

You will receive a JSON object containing already-computed statistics (SMA trend, volatility, weekday seasonality, anomalies, room demand, and a 14-day projection). Do not invent, recompute, or contradict any number in that JSON — only interpret it.

Respond with ONLY a JSON object (no markdown fences, no preamble) in exactly this shape:
{
  "summary": "2-4 sentence executive summary of what's happening and what's projected, written in plain business English",
  "recommendations": ["short, concrete, actionable recommendation", "..."],
  "risks": ["short caveat or risk to watch", "..."]
}
Rules:
- 2 to 4 recommendations, 0 to 3 risks.
- Every number you mention must come directly from the provided JSON.
- Keep each recommendation and risk to one sentence.
- Do not use markdown formatting, headers, or bullet characters inside the strings.
- If the data is too sparse to say much, say so plainly in "summary" and keep recommendations minimal.`;

function withTimeout(promise, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise(controller.signal).finally(() => clearTimeout(timer));
}

function safeParseModelJSON(text) {
  // The model is instructed to return raw JSON, but strip code fences
  // defensively in case it wraps the response anyway.
  const cleaned = text.replace(/^```json\s*|^```\s*|```$/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.summary !== "string") throw new Error("Missing summary in AI response.");
  return {
    summary: parsed.summary.trim(),
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4).map(String) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 3).map(String) : [],
  };
}

function resolveProvider() {
  const explicit = (process.env.AI_PROVIDER || "").toLowerCase();
  if (explicit === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (explicit === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (explicit === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  // Auto-detect, Gemini first since it's the only one with a genuinely free tier.
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

async function callGemini(context) {
  // Google's free-tier defaults and per-project quotas have been shifting
  // fast in 2026 (2.5 Flash/Pro stopped being issued to new API keys;
  // gemini-3-flash-preview has shown per-project quotas as low as 5
  // requests/minute). Try the configured model first, then fall back down
  // this list on model-unavailable (404) or overload/quota errors (429/503)
  // — but only ONE attempt per model, no retries within a model, so a burst
  // of forecast requests can't itself burn through a tiny quota.
  const candidates = [GEMINI_MODEL, "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-2.0-flash"].filter(
    (m, i, arr) => arr.indexOf(m) === i
  );

  for (const model of candidates) {
    const response = await withTimeout(
      (signal) =>
        fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }] }],
            generationConfig: {
              maxOutputTokens: AI_MAX_TOKENS,
              responseMimeType: "application/json",
            },
          }),
        }),
      AI_TIMEOUT_MS
    );

    if (response.ok) {
      const data = await response.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || "").join("");
      return text || null;
    }

    const errBody = await response.text().catch(() => "");
    console.error(`AI forecast narrative: Gemini API error (model=${model})`, response.status, errBody);
    // 404 "no longer available to new users" -> try the next model.
    // 429 (quota) / 503 (overloaded) -> also worth trying a different model,
    // since quotas are tracked per-model, not per-project.
    const shouldTryNextModel = response.status === 404 || response.status === 429 || response.status === 503;
    if (!shouldTryNextModel) return null; // e.g. bad API key (401/403) — no point trying other models
  }
  return null;
}

async function callAnthropic(context) {
  const response = await withTimeout(
    (signal) =>
      fetch(ANTHROPIC_API_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: AI_MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: JSON.stringify(context) }],
        }),
      }),
    AI_TIMEOUT_MS
  );

  if (!response.ok) {
    console.error("AI forecast narrative: Anthropic API error", response.status, await response.text().catch(() => ""));
    return null;
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((block) => block.type === "text");
  return textBlock ? textBlock.text : null;
}

async function callOpenAI(context) {
  const response = await withTimeout(
    (signal) =>
      fetch(OPENAI_API_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_tokens: AI_MAX_TOKENS,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(context) },
          ],
        }),
      }),
    AI_TIMEOUT_MS
  );

  if (!response.ok) {
    console.error("AI forecast narrative: OpenAI API error", response.status, await response.text().catch(() => ""));
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || null;
}

/**
 * @param {object} context - pre-computed forecast statistics (numbers only, no PII).
 * @returns {Promise<{summary: string, recommendations: string[], risks: string[]} | null>}
 */
async function generateForecastNarrative(context) {
  const provider = resolveProvider();
  if (!provider) return null;

  try {
    let text;
    if (provider === "gemini") text = await callGemini(context);
    else if (provider === "openai") text = await callOpenAI(context);
    else text = await callAnthropic(context);

    if (!text) return null;
    return safeParseModelJSON(text);
  } catch (err) {
    console.error(`AI forecast narrative: generation failed (${provider})`, err.message);
    return null;
  }
}

module.exports = { generateForecastNarrative, GEMINI_MODEL, ANTHROPIC_MODEL, OPENAI_MODEL };
