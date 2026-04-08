"use client";

import { useState, useRef, useEffect, useCallback } from "react";

type TabName = "upload" | "detail";
type Tool = "select" | "pen" | "text" | "circle" | "wavy" | "eraser";

interface Student {
  id: string;
  name: string;
  images: File[];
  imageUrls: string[];
  ocrText: string;
  essayDetail: any | null;
  report: string;
  status: "idle" | "grading" | "done" | "error";
}

interface DrawAction {
  type: "pen" | "text" | "circle" | "wavy";
  color: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  endX?: number;
  text?: string;
  fontSize?: number;
}

const PRIMARY = "#2c3e6b";
const RED = "#c0392b";
const GREEN = "#27ae60";
const BG = "#faf8f5";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function Home() {
  const [tab, setTab] = useState<TabName>("upload");
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState("");
  const [grade, setGrade] = useState("三年级下");
  const [topic, setTopic] = useState("中华传统节日");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepText, setStepText] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [newName, setNewName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customEpPro, setCustomEpPro] = useState("");
  const [customEpFast, setCustomEpFast] = useState("");

  const [tool, setTool] = useState<Tool>("select");
  const [strokeColor, setStrokeColor] = useState(RED);
  const [penWidth, setPenWidth] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [curPoints, setCurPoints] = useState<{ x: number; y: number }[]>([]);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState("");
  const [editIdx, setEditIdx] = useState(-1);
  const [dragIdx, setDragIdx] = useState(-1);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [actionMap, setActionMap] = useState<Record<string, DrawAction[]>>({});
  const [histMap, setHistMap] = useState<Record<string, DrawAction[][]>>({});
  const [histIdx, setHistIdx] = useState<Record<string, number>>({});

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const txtRef = useRef<HTMLInputElement>(null);

  const activeStudent = students.find((s) => s.id === activeStudentId) || null;
  const pk = activeStudentId + "_" + pageIndex;

  // ===== HiDPI Canvas drawing =====
  const redraw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    const acts = actionMap[pk] || [];
    for (const a of acts) {
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (a.type === "pen" && a.points && a.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(a.points[0].x, a.points[0].y);
        for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y);
        ctx.stroke();
      } else if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) {
        ctx.beginPath();
        const rx = Math.abs(a.w) / 2, ry = Math.abs(a.h) / 2;
        if (rx > 0 && ry > 0) {
          ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (a.type === "text" && a.x != null && a.y != null && a.text) {
        const fs = a.fontSize || 18;
        ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(a.text, a.x, a.y);
      } else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) {
        ctx.beginPath();
        let wx = Math.min(a.x, a.endX);
        const mx = Math.max(a.x, a.endX);
        ctx.moveTo(wx, a.y);
        while (wx < mx) {
          ctx.quadraticCurveTo(wx + 4, a.y - 5, wx + 8, a.y);
          ctx.quadraticCurveTo(wx + 12, a.y + 5, wx + 16, a.y);
          wx += 16;
        }
        ctx.stroke();
      }
    }
  }, [actionMap, pk]);

  useEffect(() => { redraw(); }, [redraw]);

  function syncCanvas() {
    const cv = canvasRef.current, im = imgRef.current;
    if (!cv || !im) return;
    const w = im.clientWidth;
    const h = im.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    redraw();
  }

  function gp(e: React.MouseEvent) {
    const cv = canvasRef.current;
    if (!cv) return { x: 0, y: 0 };
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pushAct(a: DrawAction) {
    const prev = actionMap[pk] || [];
    const next = [...prev, a];
    setActionMap(p => ({ ...p, [pk]: next }));
    const h = histMap[pk] || [prev];
    const i = histIdx[pk] ?? 0;
    const nh = [...h.slice(0, i + 1), next];
    setHistMap(p => ({ ...p, [pk]: nh }));
    setHistIdx(p => ({ ...p, [pk]: nh.length - 1 }));
  }

  function replaceAct(idx: number, a: DrawAction) {
    const prev = actionMap[pk] || [];
    const next = prev.map((old, i) => i === idx ? a : old);
    setActionMap(p => ({ ...p, [pk]: next }));
    const h = histMap[pk] || [prev];
    const hi = histIdx[pk] ?? 0;
    const nh = [...h.slice(0, hi + 1), next];
    setHistMap(p => ({ ...p, [pk]: nh }));
    setHistIdx(p => ({ ...p, [pk]: nh.length - 1 }));
  }

  function undo() {
    const h = histMap[pk], i = histIdx[pk] ?? 0;
    if (!h || i <= 0) return;
    setHistIdx(p => ({ ...p, [pk]: i - 1 }));
    setActionMap(p => ({ ...p, [pk]: h[i - 1] }));
  }

  function redo() {
    const h = histMap[pk], i = histIdx[pk] ?? 0;
    if (!h || i >= h.length - 1) return;
    setHistIdx(p => ({ ...p, [pk]: i + 1 }));
    setActionMap(p => ({ ...p, [pk]: h[i + 1] }));
  }

  function mDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = gp(e);
    if (tool === "select") {
      const acts = actionMap[pk] || [];
      const hi = hitTest(acts, p.x, p.y);
      if (hi >= 0) {
        setDragIdx(hi);
        const a = acts[hi];
        setDragOffset({ x: p.x - (a.x || (a.points ? a.points[0].x : 0)), y: p.y - (a.y || (a.points ? a.points[0].y : 0)) });
        setIsDrawing(true);
      }
    }
    else if (tool === "pen") { setIsDrawing(true); setCurPoints([p]); }
    else if (tool === "circle" || tool === "wavy") { setIsDrawing(true); setDrawStart(p); }
    else if (tool === "text") {
      const acts = actionMap[pk] || [];
      const hi = hitTestText(acts, p.x, p.y);
      if (hi >= 0) {
        const a = acts[hi];
        setEditIdx(hi);
        setTextPos({ x: a.x!, y: a.y! });
        setTextVal(a.text || "");
        setStrokeColor(a.color);
      } else {
        setEditIdx(-1);
        setTextPos({ x: p.x, y: p.y });
        setTextVal("");
      }
      setTimeout(() => txtRef.current?.focus(), 30);
    }
    else if (tool === "eraser") {
      const acts = actionMap[pk] || [];
      const hi = hitTest(acts, p.x, p.y);
      if (hi >= 0) {
        const next = acts.filter((_, j) => j !== hi);
        setActionMap(pr => ({ ...pr, [pk]: next }));
        const h = histMap[pk] || [acts];
        const idx = histIdx[pk] ?? 0;
        const nh = [...h.slice(0, idx + 1), next];
        setHistMap(pr => ({ ...pr, [pk]: nh }));
        setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 }));
      }
    }
  }

  function mDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = gp(e);
    const acts = actionMap[pk] || [];
    const hi = hitTestText(acts, p.x, p.y);
    if (hi >= 0) {
      const a = acts[hi];
      setTool("text");
      setEditIdx(hi);
      setTextPos({ x: a.x!, y: a.y! });
      setTextVal(a.text || "");
      setStrokeColor(a.color);
      setTimeout(() => txtRef.current?.focus(), 30);
    }
  }

  function mMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const p = gp(e);
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    if (tool === "select" && dragIdx >= 0) {
      const acts = [...(actionMap[pk] || [])];
      const a = { ...acts[dragIdx] };
      const dx = p.x - dragOffset.x;
      const dy = p.y - dragOffset.y;
      if (a.type === "pen" && a.points) {
        const origFirst = acts[dragIdx].points![0];
        const moveX = dx - origFirst.x;
        const moveY = dy - origFirst.y;
        a.points = a.points.map(pt => ({ x: pt.x + moveX, y: pt.y + moveY }));
      } else if (a.type === "circle" || a.type === "text") {
        a.x = dx; a.y = dy;
      } else if (a.type === "wavy") {
        const width = (a.endX || 0) - (a.x || 0);
        a.x = dx; a.y = dy; a.endX = dx + width;
      }
      acts[dragIdx] = a;
      setActionMap(pr => ({ ...pr, [pk]: acts }));
    }
    else if (tool === "pen") {
      setCurPoints(prev => [...prev, p]);
      redraw();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
      const pts = [...curPoints, p];
      if (pts.length > 1) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); }
    } else if (tool === "circle") {
      redraw();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth;
      const w = p.x - drawStart.x, h = p.y - drawStart.y;
      const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
      if (rx > 2 && ry > 2) { ctx.beginPath(); ctx.ellipse(drawStart.x + w / 2, drawStart.y + h / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else if (tool === "wavy") {
      redraw();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth;
      ctx.beginPath();
      let wx = Math.min(drawStart.x, p.x);
      const mx = Math.max(drawStart.x, p.x);
      ctx.moveTo(wx, drawStart.y);
      while (wx < mx) { ctx.quadraticCurveTo(wx + 4, drawStart.y - 5, wx + 8, drawStart.y); ctx.quadraticCurveTo(wx + 12, drawStart.y + 5, wx + 16, drawStart.y); wx += 16; }
      ctx.stroke();
    }
  }

  function mUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    setIsDrawing(false);
    const p = gp(e);
    if (tool === "select" && dragIdx >= 0) {
      const acts = actionMap[pk] || [];
      const h = histMap[pk] || [];
      const idx = histIdx[pk] ?? 0;
      const nh = [...h.slice(0, idx + 1), [...acts]];
      setHistMap(pr => ({ ...pr, [pk]: nh }));
      setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 }));
      setDragIdx(-1);
    }
    else if (tool === "pen" && curPoints.length > 1) { pushAct({ type: "pen", color: strokeColor, lineWidth: penWidth, points: [...curPoints, p] }); setCurPoints([]); }
    else if (tool === "circle") { const w = p.x - drawStart.x, h = p.y - drawStart.y; if (Math.abs(w) > 5 && Math.abs(h) > 5) pushAct({ type: "circle", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, w, h }); }
    else if (tool === "wavy") { if (Math.abs(p.x - drawStart.x) > 10) pushAct({ type: "wavy", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, endX: p.x }); }
  }

  function commitText() {
    if (textVal.trim() && textPos) {
      const act: DrawAction = { type: "text", color: strokeColor, lineWidth: penWidth, x: textPos.x, y: textPos.y, text: textVal, fontSize: 18 };
      if (editIdx >= 0) {
        replaceAct(editIdx, act);
      } else {
        pushAct(act);
      }
    } else if (editIdx >= 0 && !textVal.trim()) {
      const acts = (actionMap[pk] || []).filter((_, i) => i !== editIdx);
      setActionMap(pr => ({ ...pr, [pk]: acts }));
    }
    setTextPos(null); setTextVal(""); setEditIdx(-1);
  }

  function hitTest(acts: DrawAction[], cx: number, cy: number): number {
    const R = 20;
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      if (a.type === "pen" && a.points) { for (const p of a.points) { if (Math.abs(p.x - cx) < R && Math.abs(p.y - cy) < R) return i; } }
      else if (a.type === "circle" && a.x != null && a.w != null && a.y != null && a.h != null) { if (Math.abs(a.x + a.w / 2 - cx) < Math.abs(a.w) / 2 + R && Math.abs(a.y + a.h / 2 - cy) < Math.abs(a.h) / 2 + R) return i; }
      else if (a.type === "text" && a.x != null && a.y != null) { if (cx > a.x - R && cx < a.x + 200 && cy > a.y - 10 && cy < a.y + (a.fontSize || 18) + 10) return i; }
      else if (a.type === "wavy" && a.x != null && a.endX != null && a.y != null) { if (cx > Math.min(a.x, a.endX) - R && cx < Math.max(a.x, a.endX) + R && Math.abs(cy - a.y) < R) return i; }
    }
    return -1;
  }

  function hitTestText(acts: DrawAction[], cx: number, cy: number): number {
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      if (a.type === "text" && a.x != null && a.y != null) {
        const fs = a.fontSize || 18;
        const tw = (a.text?.length || 1) * fs;
        if (cx > a.x - 5 && cx < a.x + tw + 5 && cy > a.y - 5 && cy < a.y + fs + 5) return i;
      }
    }
    return -1;
  }

  function exportOnePNG(studentId: string, pIdx: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      const stu = students.find(s => s.id === studentId);
      if (!stu || !stu.imageUrls[pIdx]) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const m = document.createElement("canvas");
        m.width = img.naturalWidth;
        m.height = img.naturalHeight;
        const ctx = m.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        const cv = canvasRef.current;
        const displayW = cv ? parseFloat(cv.style.width) : img.naturalWidth;
        const scale = img.naturalWidth / (displayW || img.naturalWidth);
        const acts = actionMap[studentId + "_" + pIdx] || [];
        for (const a of acts) {
          ctx.strokeStyle = a.color;
          ctx.fillStyle = a.color;
          ctx.lineWidth = a.lineWidth * scale;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          if (a.type === "pen" && a.points && a.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(a.points[0].x * scale, a.points[0].y * scale);
            for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x * scale, a.points[i].y * scale);
            ctx.stroke();
          } else if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) {
            const rx = Math.abs(a.w * scale) / 2, ry = Math.abs(a.h * scale) / 2;
            if (rx > 0 && ry > 0) { ctx.beginPath(); ctx.ellipse((a.x + a.w / 2) * scale, (a.y + a.h / 2) * scale, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); }
          } else if (a.type === "text" && a.x != null && a.y != null && a.text) {
            const fs = (a.fontSize || 18) * scale;
            ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`;
            ctx.textBaseline = "top";
            ctx.fillText(a.text, a.x * scale, a.y * scale);
          } else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) {
            ctx.beginPath();
            let wx = Math.min(a.x, a.endX) * scale;
            const mx = Math.max(a.x, a.endX) * scale;
            const wy = a.y * scale;
            ctx.moveTo(wx, wy);
            const step = 16 * scale;
            while (wx < mx) { ctx.quadraticCurveTo(wx + step * 0.25, wy - 5 * scale, wx + step * 0.5, wy); ctx.quadraticCurveTo(wx + step * 0.75, wy + 5 * scale, wx + step, wy); wx += step; }
            ctx.stroke();
          }
        }
        m.toBlob(blob => resolve(blob), "image/png");
      };
      img.onerror = () => resolve(null);
      img.src = stu.imageUrls[pIdx];
    });
  }

  function exportPNG() {
    if (!activeStudent) return;
    exportOnePNG(activeStudentId, pageIndex).then(blob => {
      if (!blob) return;
      const link = document.createElement("a");
      link.download = "批注_" + activeStudent.name + "_" + (pageIndex + 1) + ".png";
      link.href = URL.createObjectURL(blob);
      link.click();
    });
  }

  async function exportAllPNGs() {
    const doneStudents = students.filter(s => s.status === "done");
    if (doneStudents.length === 0) { alert("没有已批改的学生"); return; }
    for (const stu of doneStudents) {
      for (let i = 0; i < stu.imageUrls.length; i++) {
        const blob = await exportOnePNG(stu.id, i);
        if (blob) {
          const link = document.createElement("a");
          link.download = stu.name + "_" + (i + 1) + ".png";
          link.href = URL.createObjectURL(blob);
          link.click();
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Load saved API settings
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hw_api_settings") || "{}");
      if (saved.apiKey) setCustomApiKey(saved.apiKey);
      if (saved.epPro) setCustomEpPro(saved.epPro);
      if (saved.epFast) setCustomEpFast(saved.epFast);
    } catch {}
  }, []);

  function addStudent() {
    if (!newName.trim()) { alert("请输入学生姓名"); return; }
    const s: Student = { id: uid(), name: newName.trim(), images: [], imageUrls: [], ocrText: "", essayDetail: null, report: "", status: "idle" };
    setStudents(prev => [...prev, s]);
    setActiveStudentId(s.id);
    setNewName("");
  }

  function removeStudent(id: string) {
    setStudents(prev => { const r = prev.find(s => s.id === id); r?.imageUrls.forEach(u => URL.revokeObjectURL(u)); return prev.filter(s => s.id !== id); });
    if (activeStudentId === id) setActiveStudentId(students.find(s => s.id !== id)?.id || "");
  }

  function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0 || !activeStudentId) return;
    setStudents(prev => prev.map(s => {
      if (s.id !== activeStudentId) return s;
      return { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...files.map(f => URL.createObjectURL(f))] };
    }));
    e.target.value = "";
  }

  function removeImage(sid: string, idx: number) {
    setStudents(prev => prev.map(s => {
      if (s.id !== sid) return s;
      URL.revokeObjectURL(s.imageUrls[idx]);
      return { ...s, images: s.images.filter((_, i) => i !== idx), imageUrls: s.imageUrls.filter((_, i) => i !== idx) };
    }));
  }

  function updateStudent(id: string, d: Partial<Student>) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, ...d } : s));
  }

  async function gradeOneStudent(sid: string) {
    const stu = students.find(s => s.id === sid);
    if (!stu || stu.images.length === 0) return;
    updateStudent(sid, { status: "grading" });
    try {
      const fd = new FormData();
      stu.images.forEach(f => fd.append("images", f));
      const r1 = await fetch("/api/ocr", { method: "POST", body: fd });
      if (!r1.ok) throw new Error("OCR 识别失败");
      const { ocrText } = await r1.json();
      updateStudent(sid, { ocrText });

      const r2 = await fetch("/api/essay-detail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ocrText, gradeInfo: grade + " " + topic }) });
      if (!r2.ok) throw new Error("作文精批失败");
      const essayDetail = await r2.json();
      updateStudent(sid, { essayDetail, status: "done" });
    } catch (err: any) {
      updateStudent(sid, { status: "error" });
      throw err;
    }
  }

  async function runGrading() {
    if (!activeStudent || activeStudent.images.length === 0) { alert("请先上传作业照片"); return; }
    setLoading(true); setProgress(0);
    setStepText("正在识别并批改...");
    setProgress(10);
    try {
      await gradeOneStudent(activeStudentId);
      setProgress(100); setStepText("批改完成！");
      setTab("detail");
    } catch (err: any) { alert("批改出错：" + err.message); }
    finally { setLoading(false); }
  }

  async function runBatchGrading() {
    const toGrade = students.filter(s => s.images.length > 0 && s.status !== "done");
    if (toGrade.length === 0) { alert("没有待批改的学生（请确保已上传照片）"); return; }
    setLoading(true);
    let done = 0;
    for (const stu of toGrade) {
      setBatchStatus(`正在批改 ${stu.name}（${done + 1}/${toGrade.length}）...`);
      setProgress(Math.round((done / toGrade.length) * 100));
      try { await gradeOneStudent(stu.id); } catch { /* continue */ }
      done++;
    }
    setProgress(100);
    setBatchStatus(`全部完成！共批改 ${done} 位学生`);
    setLoading(false);
    setTab("detail");
    setTimeout(() => setBatchStatus(""), 3000);
  }

  function copyDetailText() {
    if (!activeStudent?.essayDetail) return;
    const d = activeStudent.essayDetail;
    let text = `【${activeStudent.name} 作文批改】\n\n`;
    text += `━━ 修改建议 ━━\n`;
    (d.corrections || []).forEach((c: any, i: number) => {
      text += `${i + 1}. [${c.paragraph}] ${c.location}\n   原文：${c.original}\n   建议：${c.suggested}\n   理由：${c.reason}\n\n`;
    });
    text += `━━ 亮点 ━━\n`;
    (d.highlights || []).forEach((h: any, i: number) => {
      text += `${i + 1}. ${h.title}：${h.description}\n`;
    });
    text += `\n━━ 四维评价 ━━\n`;
    const lb: Record<string, string> = { content: "内容", structure: "结构", language: "语言", writing: "书写" };
    if (d.dimensions) {
      Object.entries(d.dimensions as Record<string, string>).forEach(([k, v]) => {
        text += `${lb[k] || k}：${v}\n`;
      });
    }
    if (d.teacher_comment) text += `\n━━ 教师总评 ━━\n${d.teacher_comment}\n`;
    if (d.improvement_tips) {
      text += `\n━━ 改进方向 ━━\n`;
      d.improvement_tips.forEach((t: string) => text += `${t}\n`);
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg("已复制到剪贴板！");
      setTimeout(() => setCopyMsg(""), 2000);
    });
  }

  function tabStyle(t: TabName) {
    return { padding: "10px 24px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer" as const, fontWeight: 600 as const, fontSize: "15px", background: tab === t ? "#fff" : "transparent", color: tab === t ? PRIMARY : "#999", borderBottom: tab === t ? "2px solid " + PRIMARY : "2px solid transparent" };
  }

  const tools: { k: Tool; l: string; ic: string }[] = [
    { k: "select", l: "选择/移动", ic: "👆" }, { k: "pen", l: "画笔", ic: "✏️" },
    { k: "text", l: "文字（双击可编辑）", ic: "T" }, { k: "circle", l: "圆圈", ic: "⭕" },
    { k: "wavy", l: "波浪线", ic: "〰" }, { k: "eraser", l: "橡皮擦", ic: "🧹" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Noto Sans SC','Microsoft YaHei',sans-serif", color: "#333" }}>

      {previewUrl && (
        <div onClick={() => setPreviewUrl(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <button onClick={() => setPreviewUrl(null)} style={{ position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}>✕</button>
          <img src={previewUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} />
        </div>
      )}

      {/* ===== Settings Modal ===== */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "90%", maxWidth: 440, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            {/* Header */}
            <div style={{ padding: "28px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: PRIMARY }}>语文作业智能批改</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#999" }}>v1.0 · AI-Powered Essay Grading</p>
              </div>
              <button onClick={() => setShowSettings(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "#f5f5f5", cursor: "pointer", fontSize: 16, color: "#999", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* About */}
            <div style={{ padding: "20px 28px" }}>
              <div style={{ background: "linear-gradient(135deg, #f0f4ff, #faf8f5)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `linear-gradient(135deg, ${PRIMARY}, #4a6fa5)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>📝</div>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#555" }}>
                      拍照上传小学语文作业，AI 自动识别手写文字并进行作文精批，生成修改建议、亮点分析和教师评语。
                    </p>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                {[
                  { icon: "📷", title: "OCR 识别", desc: "手写文字自动转文本" },
                  { icon: "✏️", title: "智能批改", desc: "AI 逐段精批+总评" },
                  { icon: "🎨", title: "图上标注", desc: "画笔、圆圈、文字批注" },
                  { icon: "📥", title: "一键导出", desc: "批注图片直接下载" },
                ].map((f, i) => (
                  <div key={i} style={{ padding: "14px 12px", borderRadius: 10, border: "1px solid #f0f0f0", background: "#fafafa" }}>
                    <span style={{ fontSize: 20 }}>{f.icon}</span>
                    <p style={{ margin: "6px 0 2px", fontSize: 13, fontWeight: 600, color: "#333" }}>{f.title}</p>
                    <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Usage info */}
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "#edf9f1", border: "1px solid #d0e8d8", marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 13, color: GREEN, fontWeight: 600 }}>✅ 免费使用</p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666", lineHeight: 1.6 }}>
                  默认使用系统提供的 AI 服务，直接上传照片即可开始批改，无需任何配置。
                </p>
              </div>

              {/* Advanced settings toggle */}
              <div
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, border: "1px solid #eee", cursor: "pointer", background: showAdvanced ? "#f8f9ff" : "#fff", transition: "all 0.2s" }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#555" }}>⚙️ 高级设置</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#bbb" }}>自定义 API 接入（开发者选项）</p>
                </div>
                <span style={{ fontSize: 14, color: "#ccc", transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>

              {/* Advanced API config (collapsible) */}
              {showAdvanced && (
                <div style={{ marginTop: 12, padding: "16px", borderRadius: 10, border: "1px solid #e8e8e8", background: "#fafafa" }}>
                  <p style={{ fontSize: 11, color: "#999", marginBottom: 14, lineHeight: 1.6 }}>
                    如需使用自己的豆包（火山引擎 Ark）API，请填写以下信息。留空则使用系统默认配置。
                  </p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>API Key</label>
                    <input
                      value={customApiKey} onChange={e => setCustomApiKey(e.target.value)}
                      placeholder="留空使用默认"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "border 0.2s" }}
                      onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = "#ddd"}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Pro 接入点 ID（精批模型）</label>
                    <input
                      value={customEpPro} onChange={e => setCustomEpPro(e.target.value)}
                      placeholder="如 ep-2024xxxxxxxxxx-xxxxx"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = "#ddd"}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "#666", display: "block", marginBottom: 4 }}>Fast 接入点 ID（OCR 模型）</label>
                    <input
                      value={customEpFast} onChange={e => setCustomEpFast(e.target.value)}
                      placeholder="如 ep-2024xxxxxxxxxx-xxxxx"
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                      onFocus={e => e.target.style.borderColor = PRIMARY} onBlur={e => e.target.style.borderColor = "#ddd"}
                    />
                  </div>
                  <button
                    onClick={() => {
                      try { localStorage.setItem("hw_api_settings", JSON.stringify({ apiKey: customApiKey, epPro: customEpPro, epFast: customEpFast })); } catch {}
                      setShowSettings(false);
                      setCopyMsg("设置已保存"); setTimeout(() => setCopyMsg(""), 1500);
                    }}
                    style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    保存设置
                  </button>
                  <p style={{ fontSize: 10, color: "#ccc", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>
                    API Key 仅保存在浏览器本地，不会上传至服务器
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 28px 24px", borderTop: "1px solid #f0f0f0", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 11, color: "#ccc" }}>Made with ❤️ for teachers · Powered by AI</p>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {copyMsg && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: GREEN, color: "#fff", padding: "8px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>{copyMsg}</div>
      )}

      <div style={{ background: "linear-gradient(135deg," + PRIMARY + ",#1a2744)", padding: "14px 32px", color: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: 2 }}>语文作业智能批改</h1>
          <p style={{ margin: "2px 0 0", fontSize: "12px", opacity: 0.7 }}>上传照片 → OCR识别 → 作文精批</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={runBatchGrading} disabled={loading || students.filter(s => s.images.length > 0 && s.status !== "done").length === 0} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>
            🚀 一键批改全部
          </button>
          <button onClick={exportAllPNGs} disabled={students.filter(s => s.status === "done").length === 0} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: students.filter(s => s.status === "done").length === 0 ? 0.5 : 1 }}>
            📥 导出所有图片
          </button>
          <button onClick={() => setShowSettings(true)} style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="设置与帮助">
            ⚙️
          </button>
        </div>
      </div>

      {batchStatus && (
        <div style={{ background: "#edf9f1", padding: "10px 32px", fontSize: 14, fontWeight: 600, color: GREEN, borderBottom: "1px solid #d0e8d8" }}>
          {batchStatus}
        </div>
      )}

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 20px" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e0e0e0", marginBottom: 16 }}>
          <button style={tabStyle("upload")} onClick={() => setTab("upload")}>📤 上传作业</button>
          <button style={tabStyle("detail")} onClick={() => setTab("detail")}>📝 批改详情</button>
        </div>

        {/* ========== UPLOAD TAB ========== */}
        {tab === "upload" && (
          <div style={{ display: "flex", gap: "48px" }}>
            <div style={{ width: "250px", flexShrink: 0, paddingRight: "24px", borderRight: "1px solid #eee" }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: "#555" }}>学生列表</h3>
              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="输入学生姓名" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, outline: "none" }} />
                <button onClick={addStudent} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: PRIMARY, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>添加</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {students.length === 0 && <p style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: "20px 0" }}>请先添加学生</p>}
                {students.map(s => (
                  <div key={s.id} onClick={() => { setActiveStudentId(s.id); setPageIndex(0); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: activeStudentId === s.id ? PRIMARY : "#fff", color: activeStudentId === s.id ? "#fff" : "#333", border: activeStudentId === s.id ? "none" : "1px solid #eee" }}>
                    <div><span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span><span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: s.status === "done" ? GREEN : s.status === "grading" ? "#f39c12" : s.status === "error" ? RED : "#eee", color: s.status === "idle" ? "#999" : "#fff" }}>{s.status === "done" ? "已批改" : s.status === "grading" ? "批改中" : s.status === "error" ? "出错" : s.images.length + "张"}</span></div>
                    <button onClick={e => { e.stopPropagation(); removeStudent(s.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: activeStudentId === s.id ? "rgba(255,255,255,0.6)" : "#ccc", fontSize: 16 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              {!activeStudent ? (
                <div style={{ textAlign: "center", padding: "80px 0", color: "#bbb" }}><p style={{ fontSize: 40 }}>👈</p><p>请先在左侧添加学生</p></div>
              ) : (
                <>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{activeStudent.name} 的作业</h3>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                    {activeStudent.imageUrls.map((url, i) => (
                      <div key={i} onClick={() => setPreviewUrl(url)} style={{ width: 120, height: 160, borderRadius: 8, overflow: "hidden", border: "1px solid #ddd", position: "relative", cursor: "pointer", flexShrink: 0 }}>
                        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={e => { e.stopPropagation(); removeImage(activeStudent.id, i); }} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 11, textAlign: "center", padding: 3 }}>{"第" + (i + 1) + "页"}</div>
                      </div>
                    ))}
                    <div onClick={() => addFileInputRef.current?.click()} style={{ width: 120, height: 160, borderRadius: 8, border: "2px dashed #ccc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fff", color: "#bbb", flexShrink: 0 }}>
                      <span style={{ fontSize: 32, lineHeight: 1 }}>+</span><span style={{ fontSize: 12, marginTop: 4 }}>添加照片</span>
                      <input ref={addFileInputRef} type="file" accept="image/*" multiple onChange={onPickImages} style={{ display: "none" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 6 }}>年级</label><select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>{["一年级上","一年级下","二年级上","二年级下","三年级上","三年级下","四年级上","四年级下","五年级上","五年级下","六年级上","六年级下"].map(g => <option key={g}>{g}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={{ fontSize: 13, fontWeight: 600, color: "#666", display: "block", marginBottom: 6 }}>主题</label><select value={topic} onChange={e => setTopic(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>{["看图写话","写人","记事","写景","状物","想象作文","日记","书信","读后感","中华传统节日","自由命题","其他"].map(t => <option key={t}>{t}</option>)}</select></div>
                  </div>
                  <button disabled={activeStudent.images.length === 0 || loading} onClick={runGrading} style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", fontSize: 16, fontWeight: 700, color: "#fff", letterSpacing: 2, cursor: activeStudent.images.length === 0 || loading ? "not-allowed" : "pointer", background: activeStudent.images.length === 0 || loading ? "#ccc" : PRIMARY }}>
                    {loading ? stepText || batchStatus : "开始批改（" + activeStudent.images.length + " 张照片）"}
                  </button>
                  {loading && <div style={{ marginTop: 12 }}><div style={{ width: "100%", height: 6, borderRadius: 3, background: "#eee" }}><div style={{ width: progress + "%", height: "100%", borderRadius: 3, background: PRIMARY, transition: "width 0.5s" }} /></div><p style={{ fontSize: 12, color: "#888", textAlign: "center", marginTop: 6 }}>{progress}%</p></div>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ========== DETAIL TAB ========== */}
        {tab === "detail" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {students.filter(s => s.status === "done").map(s => (
                <button key={s.id} onClick={() => { setActiveStudentId(s.id); setPageIndex(0); }} style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", background: activeStudentId === s.id ? PRIMARY : "#eee", color: activeStudentId === s.id ? "#fff" : "#666", fontWeight: 600, fontSize: 13 }}>{s.name}</button>
              ))}
              {students.filter(s => s.status === "done").length === 0 && <p style={{ color: "#bbb", fontSize: 14 }}>还没有批改完成的学生</p>}
            </div>

            {activeStudent?.status === "done" && (
              <div style={{ display: "flex", gap: 16 }}>
                {/* LEFT: Image + Canvas + Toolbar */}
                <div style={{ flex: "0 0 56%", display: "flex", flexDirection: "column" }}>
                  {/* Toolbar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", marginBottom: 8, background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", flexWrap: "wrap" }}>
                    {tools.map(t => (
                      <button key={t.k} onClick={() => { setTool(t.k); setTextPos(null); }} title={t.l} style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: tool === t.k ? PRIMARY : "transparent", color: tool === t.k ? "#fff" : "#555", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.ic}</button>
                    ))}
                    <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                    <button onClick={undo} title="撤销 Ctrl+Z" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16 }}>↩</button>
                    <button onClick={redo} title="重做 Ctrl+Y" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16 }}>↪</button>
                    <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                    {[RED, "#e67e22", "#2980b9", GREEN, "#333"].map(c => (
                      <div key={c} onClick={() => setStrokeColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: strokeColor === c ? "3px solid #333" : "2px solid #ddd" }} />
                    ))}
                    <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                    <button onClick={exportPNG} title="导出当前页" style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 12, fontWeight: 600 }}>💾 导出</button>
                  </div>

                  {/* Image + Canvas overlay */}
                  <div id="canvas-wrap" style={{ position: "relative", maxHeight: "calc(100vh - 230px)", overflow: "auto", background: "#fff", borderRadius: 10, border: "1px solid #eee" }}>
                    {activeStudent.imageUrls[pageIndex] && (
                      <>
                        <img ref={imgRef} src={activeStudent.imageUrls[pageIndex]} alt="" style={{ width: "100%", display: "block" }} onLoad={syncCanvas} />
                        <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, cursor: tool === "select" ? "grab" : tool === "text" ? "text" : "crosshair" }}
                          onMouseDown={mDown} onMouseMove={mMove} onMouseUp={mUp} onDoubleClick={mDblClick}
                          onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); redraw(); } }} />
                        {textPos && (
                          <input ref={txtRef} value={textVal} onChange={e => setTextVal(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { setTextPos(null); setTextVal(""); setEditIdx(-1); } }}
                            onBlur={commitText}
                            style={{ position: "absolute", left: textPos.x, top: textPos.y - 4, fontSize: 18, fontWeight: "bold", color: strokeColor, background: "rgba(255,255,255,0.9)", border: "2px solid " + strokeColor, borderRadius: 4, padding: "2px 6px", outline: "none", zIndex: 10, minWidth: 80 }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Paging */}
                  {activeStudent.images.length > 1 && (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "8px 0" }}>
                      <button disabled={pageIndex <= 0} onClick={() => setPageIndex(i => i - 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 13 }}>← 上一页</button>
                      <span style={{ fontSize: 13, color: "#666" }}>{"第 " + (pageIndex + 1) + " / " + activeStudent.images.length + " 页"}</span>
                      <button disabled={pageIndex >= activeStudent.images.length - 1} onClick={() => setPageIndex(i => i + 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 13 }}>下一页 →</button>
                    </div>
                  )}
                </div>

                {/* RIGHT: Essay detail panel */}
                <div style={{ flex: "0 0 42%", overflow: "auto", maxHeight: "calc(100vh - 180px)" }}>
                  {activeStudent.essayDetail ? (
                    <>
                      {/* Copy button */}
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                        <button onClick={copyDetailText} style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid " + PRIMARY, background: copyMsg ? GREEN : "transparent", color: copyMsg ? "#fff" : PRIMARY, cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "all 0.3s" }}>
                          {copyMsg || "📋 一键复制批改内容"}
                        </button>
                      </div>

                      {/* 1. Corrections */}
                      <div style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: RED }}>✏️ 五处修改建议 <span style={{ fontSize: 12, fontWeight: 400, color: "#999" }}>（参考后在左侧图上标注）</span></h3>
                        {(activeStudent.essayDetail.corrections || []).map((c: any, i: number) => (
                          <div key={i} style={{ background: "#fff", borderRadius: 8, padding: 14, marginBottom: 10, border: "1px solid #eee" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 4, background: RED, color: "#fff" }}>{"修改 " + (i + 1) + " · " + c.paragraph}</span>
                            <p style={{ fontSize: 12, color: "#999", margin: "6px 0" }}>{c.location}</p>
                            <div style={{ padding: "8px 12px", borderRadius: 6, background: "#fef2f2", marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: RED }}>📍 原文：</span><span style={{ fontSize: 13 }}>{c.original}</span></div>
                            <div style={{ padding: "8px 12px", borderRadius: 6, background: "#edf9f1", borderLeft: "3px solid " + GREEN, marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 600, color: GREEN }}>✅ 建议改为：</span><span style={{ fontSize: 13 }}>{c.suggested}</span></div>
                            <div style={{ padding: "8px 12px", borderRadius: 6, background: "#f5f5f5", borderLeft: "3px solid #bbb" }}><span style={{ fontSize: 12, fontWeight: 600, color: "#888" }}>💡 修改理由：</span><span style={{ fontSize: 13, color: "#666" }}>{c.reason}</span></div>
                          </div>
                        ))}
                      </div>

                      {/* 2. Highlights */}
                      <div style={{ marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: GREEN }}>🌟 三大亮点</h3>
                        {(activeStudent.essayDetail.highlights || []).map((h: any, i: number) => (
                          <div key={i} style={{ background: "#edf9f1", borderRadius: 8, padding: 14, marginBottom: 8, borderLeft: "3px solid " + GREEN }}>
                            <p style={{ fontWeight: 700, fontSize: 14, color: GREEN, marginBottom: 4 }}>{(i + 1) + ". " + h.title}</p>
                            <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#444" }}>{h.description}</p>
                          </div>
                        ))}
                      </div>

                      {/* 3. Dimensions */}
                      {activeStudent.essayDetail.dimensions && (
                        <div style={{ marginBottom: 16 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>📊 四维评价</h3>
                          {Object.entries(activeStudent.essayDetail.dimensions as Record<string, string>).map(([key, val]) => {
                            const lb: Record<string, string> = { content: "内容", structure: "结构", language: "语言", writing: "书写" };
                            return (<div key={key} style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #eee" }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: PRIMARY }}>{lb[key] || key}</p><p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: "#555" }}>{val}</p></div>);
                          })}
                        </div>
                      )}

                      {/* 4. Teacher comment */}
                      {activeStudent.essayDetail.teacher_comment && (
                        <div style={{ background: "#fff8ed", borderRadius: 8, padding: 16, border: "1px solid #f0e0c0", marginBottom: 16 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>💬 教师总评</h3>
                          <p style={{ fontSize: 14, lineHeight: 2, margin: 0, color: "#555" }}>{activeStudent.essayDetail.teacher_comment}</p>
                        </div>
                      )}

                      {/* 5. Improvement tips */}
                      {activeStudent.essayDetail.improvement_tips && activeStudent.essayDetail.improvement_tips.length > 0 && (
                        <div style={{ background: "#f0f4ff", borderRadius: 8, padding: 16, border: "1px solid #d0d8f0" }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: PRIMARY }}>📝 作文改进方向</h3>
                          {activeStudent.essayDetail.improvement_tips.map((tip: string, i: number) => (
                            <p key={i} style={{ fontSize: 13, lineHeight: 1.8, margin: "0 0 6px", color: "#444" }}>{tip}</p>
                          ))}
                        </div>
                      )}
                    </>
                  ) : <p style={{ color: "#bbb", textAlign: "center", paddingTop: 40 }}>请先批改后查看</p>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
