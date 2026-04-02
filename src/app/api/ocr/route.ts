import { NextRequest, NextResponse } from "next/server";
import { callDoubaoWithImages } from "@/lib/ark";
import { OCR_PROMPT } from "@/lib/prompts";

// POST /api/ocr
// 前端上传图片 → 这里接收 → 发给豆包识别 → 返回文字
export async function POST(req: NextRequest) {
  try {
    // 1. 从前端接收上传的图片文件
    const formData = await req.formData();
    const files = formData.getAll("images") as File[];

    // 2. 把图片转成 base64 格式（豆包 API 要求的格式）
    const images = await Promise.all(
      files.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        return {
          base64: buffer.toString("base64"),
          mediaType: file.type || "image/jpeg",
        };
      })
    );

    // 3. 调用豆包 AI，发送图片 + OCR 提示词
    const result = await callDoubaoWithImages(
      OCR_PROMPT,
      images,
      "请识别这份小学语文作业中的所有手写内容。"
    );

    // 4. 把识别结果返回给前端
    return NextResponse.json({ ocrText: result });
  } catch (error: any) {
    console.error("OCR error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}