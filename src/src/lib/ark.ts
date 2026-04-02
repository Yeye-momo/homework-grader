import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ARK_API_KEY,
  baseURL: "https://ark.cn-beijing.volces.com/api/v3",
});

export async function callDoubao(system: string, userText: string) {
  const response = await client.chat.completions.create({
    model: process.env.ARK_ENDPOINT_ID!,
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
  text: string
) {
  const imageContents = images.map((img) => ({
    type: "image_url" as const,
    image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
  }));

  const response = await client.chat.completions.create({
    model: process.env.ARK_ENDPOINT_ID!,
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