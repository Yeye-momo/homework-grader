import { NextRequest, NextResponse } from "next/server";
import { callDoubao } from "@/lib/ark";
import { ESSAY_DETAIL_PROMPT } from "@/lib/prompts";

// POST /api/essay-detail
// 接收 OCR 文字 → 发给豆包精批 → 返回结构化的批改结果（JSON）
export async function POST(req: NextRequest) {
  try {
    // 1. 从前端接收 OCR 文字和年级主题信息
    const { ocrText, gradeInfo } = await req.json();
    const ctx = gradeInfo ? "\n\n年级与主题：" + gradeInfo : "";

    // 2. 调用豆包 AI 进行精批
    const raw = await callDoubao(
      ESSAY_DETAIL_PROMPT,
      "学生作文内容（OCR识别）：\n\n" + ocrText + ctx + "\n\n请进行作文精批。"
    );

    // 3. 解析 AI 返回的 JSON（AI 有时会加 ```json 标记，需要清理）
    const cleaned = raw.replace(/```json\s?|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // 如果直接解析失败，尝试提取 JSON 部分
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("AI 返回的格式不正确，无法解析");
    }

    // 4. 返回结构化的批改结果
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Essay detail error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}