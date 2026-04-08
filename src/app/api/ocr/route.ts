import { NextRequest, NextResponse } from "next/server";
import { callDoubaoWithImages } from "@/lib/ark";
import { OCR_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const customKey = req.headers.get("x-ark-api-key") || undefined;
    const customEpPro = req.headers.get("x-ark-ep-pro") || undefined;
    const customEpFast = req.headers.get("x-ark-ep-fast") || undefined;

    const formData = await req.formData();
    const files = formData.getAll("images") as File[];

    const images = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return {
          base64: buffer.toString("base64"),
          mediaType: file.type || "image/jpeg",
        };
      })
    );

    const result = await callDoubaoWithImages(
      OCR_PROMPT,
      images,
      "请识别这份小学语文作业中的所有手写内容。",
      { apiKey: customKey, epPro: customEpPro, epFast: customEpFast }
    );

    return NextResponse.json({ ocrText: result });
  } catch (error: any) {
    console.error("OCR error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}