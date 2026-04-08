import { NextRequest, NextResponse } from "next/server";
import { callDoubao } from "@/lib/ark";
import { ESSAY_DETAIL_PROMPT, MODEL_ESSAY_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { ocrText, gradeInfo, isModelEssay, modelAnalysis, specialRequirement, apiKey, epPro, epFast } = await req.json();
    const opts = { apiKey: apiKey || undefined, epPro: epPro || undefined, epFast: epFast || undefined };

    if (isModelEssay) {
      const raw = await callDoubao(MODEL_ESSAY_PROMPT, "范文内容：\n\n" + ocrText + (gradeInfo ? "\n\n年级与主题：" + gradeInfo : ""), opts);
      return NextResponse.json(raw);
    }

    let ctx = gradeInfo ? "\n\n年级与主题：" + gradeInfo : "";
    if (specialRequirement) ctx += "\n\n【本次特殊要求】" + specialRequirement;
    if (modelAnalysis) ctx += "\n\n【范文模板分析（请参考对比）】\n" + modelAnalysis;

    const raw = await callDoubao(
      ESSAY_DETAIL_PROMPT,
      "学生作文内容（OCR识别）：\n\n" + ocrText + ctx + "\n\n请进行作文精批。",
      opts
    );

    const cleaned = raw.replace(/```json\s?|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error("AI 返回的格式不正确，无法解析");
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Essay detail error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}