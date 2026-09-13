/**
 * Thin wrapper around OpenAI's Chat Completions API — used by both content
 * generation (lib/generate-content.ts) and review-reply drafting
 * (app/api/reviews/[id]/generate-reply/route.ts) so there's exactly one
 * place that knows which provider/model/key we're using.
 *
 * Swapped from Anthropic to OpenAI because that's the API key Jimmy
 * actually has. Set OPENAI_API_KEY in Vercel — get one at
 * https://platform.openai.com/api-keys (pay-as-you-go, separate from any
 * ChatGPT subscription).
 */

const MODEL = "gpt-4o-mini";

export async function generateText(prompt: string, opts: { maxTokens?: number; json?: boolean } = {}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — required to generate content.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      messages: [{ role: "user", content: prompt }],
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI API error (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }
  return content;
}
