import OpenAI from "openai";

// Create client with given API key (custom or env default)
function getClient(apiKey?: string) {
  return new OpenAI({
    apiKey: apiKey || process.env.ARK_API_KEY,
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
  });
}

function getEndpoint(type: "ocr" | "grading", opts?: { epPro?: string; epFast?: string }) {
  if (type === "ocr") return opts?.epFast || process.env.ARK_ENDPOINT_ID_FAST || process.env.ARK_ENDPOINT_ID!;
  return opts?.epPro || process.env.ARK_ENDPOINT_ID!;
}

export async function callDoubao(system: string, userText: string, opts?: { apiKey?: string; epPro?: string; epFast?: string }) {
  const client = getClient(opts?.apiKey);
  const response = await client.chat.completions.create({
    model: getEndpoint("grading", opts),
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText },
    ],
    max_tokens: 4096,
  });
  return response.choices[0]?.message?.content || "";
}

export async function callDoubaoWithImages(
  system: string,
  images: { base64: string; mediaType: string }[],
  text: string,
  opts?: { apiKey?: string; epPro?: string; epFast?: string }
) {
  const client = getClient(opts?.apiKey);
  const imageContents = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
  }));

  const response = await client.chat.completions.create({
    model: getEndpoint("ocr", opts),
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [...imageContents, { type: "text", text }],
      },
    ],
    max_tokens: 4096,
  });
  return response.choices[0]?.message?.content || "";
}