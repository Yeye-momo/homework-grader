import { NextRequest, NextResponse } from "next/server";
import { callDoubao } from "@/lib/ark";
import { REPORT_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { essayDetail } = await req.json();
    const report = await callDoubao(
      REPORT_PROMPT,
      "批改结果：\n" + JSON.stringify(essayDetail, null, 2) + "\n\n请生成批改报告。"
    );
    return NextResponse.json({ report });
  } catch (error: any) {
    console.error("Report error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}