"use client";
import { useState, useRef, useEffect, useCallback } from "react";

type TabName = "upload" | "detail" | "archive";
type Tool = "pen" | "text" | "circle" | "wavy" | "eraser" | "hand" | "penEraser";
interface Student { id: string; name: string; images: File[]; imageUrls: string[]; ocrText: string; essayDetail: any | null; report: string; status: "idle" | "grading" | "done" | "error"; errorMsg?: string; archived?: boolean; }
interface DrawAction { type: "pen" | "text" | "circle" | "wavy"; color: string; lineWidth: number; points?: { x: number; y: number }[]; x?: number; y?: number; w?: number; h?: number; endX?: number; text?: string; fontSize?: number; }

const PRIMARY = "#2c3e6b", RED = "#c0392b", GREEN = "#27ae60", ORANGE = "#e67e22", BG = "#faf8f5";
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
const QUICK_STAMPS = [
  { label: "好词✓", color: RED }, { label: "好句✓", color: RED }, { label: "精彩!", color: RED },
  { label: "改", color: RED }, { label: "错字", color: RED }, { label: "?", color: ORANGE },
  { label: "不通顺", color: ORANGE }, { label: "离题", color: ORANGE }, { label: "加标点", color: ORANGE }, { label: "标点符号", color: ORANGE },
  { label: "分段", color: "#2980b9" },
];

// ===== IndexedDB for images (reliable version) =====
const DB_NAME = "hw_grader_img_v2";
const DB_STORE = "imgs";

function openImgDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Save one image as base64 data URL
function saveOneImage(studentId: string, pageIdx: number, dataUrl: string): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      const db = await openImgDB();
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(dataUrl, studentId + "_img_" + pageIdx);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch { resolve(); }
  });
}

// Save/load model essay images in IndexedDB
function saveModelImage(idx: number, dataUrl: string): Promise<void> {
  return new Promise(async (resolve) => {
    try {
      const db = await openImgDB();
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(dataUrl, "model_essay_img_" + idx);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    } catch { resolve(); }
  });
}
async function loadModelImages(count: number): Promise<string[]> {
  try {
    const db = await openImgDB();
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = await new Promise<string>((resolve) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get("model_essay_img_" + i);
        req.onsuccess = () => resolve(req.result || "");
        req.onerror = () => resolve("");
      });
      if (url) results.push(url);
    }
    db.close();
    return results;
  } catch { return []; }
}
async function clearModelImages(count: number) {
  try {
    const db = await openImgDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    for (let i = 0; i < count; i++) tx.objectStore(DB_STORE).delete("model_essay_img_" + i);
    tx.oncomplete = () => db.close();
  } catch {}
}

// Load all images for a student
async function loadStudentImages(studentId: string, count: number): Promise<string[]> {
  try {
    const db = await openImgDB();
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      const url = await new Promise<string>((resolve) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(studentId + "_img_" + i);
        req.onsuccess = () => resolve(req.result || "");
        req.onerror = () => resolve("");
      });
      if (url) results.push(url);
    }
    db.close();
    return results;
  } catch { return []; }
}

// Delete all images for a student
async function deleteStudentImages(studentId: string, count: number) {
  try {
    const db = await openImgDB();
    const tx = db.transaction(DB_STORE, "readwrite");
    for (let i = 0; i < count; i++) tx.objectStore(DB_STORE).delete(studentId + "_img_" + i);
    tx.oncomplete = () => db.close();
  } catch {}
}

export default function Home() {
  const [tab, setTab] = useState<TabName>("upload");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check); }, []);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState("");
  const [grade, setGrade] = useState("三年级下");
  const [topic, setTopic] = useState("中华传统节日");
  const [specialReq, setSpecialReq] = useState("");
  const [modelText, setModelText] = useState("");
  const [modelImageUrls, setModelImageUrls] = useState<string[]>([]);
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const [modelDragOver, setModelDragOver] = useState(false);
  const modelFileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stepText, setStepText] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [newName, setNewName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [parentNotice, setParentNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [tool, setTool] = useState<Tool>("pen");
  const [strokeColor, setStrokeColor] = useState(RED);
  const [penWidth] = useState(2);
  const [fontSize, setFontSize] = useState(14);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [curPoints, setCurPoints] = useState<{ x: number; y: number }[]>([]);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textVal, setTextVal] = useState("");
  const [textBoxW, setTextBoxW] = useState(220);
  const [editIdx, setEditIdx] = useState(-1);
  const [movingIdx, setMovingIdx] = useState(-1);
  const [movingOffset, setMovingOffset] = useState({ x: 0, y: 0 });
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [pendingStamp, setPendingStamp] = useState<{ label: string; color: string } | null>(null);
  const [handDragging, setHandDragging] = useState(false);
  const [handStart, setHandStart] = useState({ x: 0, y: 0, scrollX: 0, scrollY: 0 });
  const [actionMap, setActionMap] = useState<Record<string, DrawAction[]>>({});
  const [histMap, setHistMap] = useState<Record<string, DrawAction[][]>>({});
  const [histIdx, setHistIdx] = useState<Record<string, number>>({});
  // Padding per student+page key
  const [padMap, setPadMap] = useState<Record<string, [number, number, number, number]>>({});

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const txtRef = useRef<HTMLTextAreaElement>(null);
  const hoverLockRef = useRef(false);
  const textClickTimer = useRef<any>(null);

  const activeStudent = students.find((s) => s.id === activeStudentId) || null;
  const pk = activeStudentId + "_" + pageIndex;
  const pad = padMap[pk] || [0, 0, 0, 0]; // [top, bot, left, right]
  const [padTop, padBot, padLeft, padRight] = pad;

  // Shift all annotations when padding changes
  function shiftAnnotations(dx: number, dy: number) {
    const acts = actionMap[pk] || [];
    if (acts.length === 0 || (dx === 0 && dy === 0)) return;
    const shifted = acts.map(a => {
      if (a.type === "pen" && a.points) return { ...a, points: a.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      if (a.type === "text" || a.type === "circle") return { ...a, x: (a.x || 0) + dx, y: (a.y || 0) + dy };
      if (a.type === "wavy") return { ...a, x: (a.x || 0) + dx, y: (a.y || 0) + dy, endX: (a.endX || 0) + dx };
      return a;
    });
    setActionMap(prev => ({ ...prev, [pk]: shifted }));
  }

  function setPad(idx: number, fn: (v: number) => number) {
    const cur = padMap[pk] || [0,0,0,0];
    const oldVal = cur[idx];
    const newVal = fn(oldVal);
    const diff = newVal - oldVal;
    if (diff === 0) return;
    // idx: 0=top, 1=bot, 2=left, 3=right
    // When adding top padding, shift annotations down; adding left, shift right
    const dx = idx === 2 ? diff : 0; // left padding changed
    const dy = idx === 0 ? diff : 0; // top padding changed
    shiftAnnotations(dx, dy);
    setPadMap(prev => { const next = [...(prev[pk] || [0,0,0,0])] as [number,number,number,number]; next[idx] = newVal; return { ...prev, [pk]: next }; });
  }
  function resetPad() {
    const cur = padMap[pk] || [0,0,0,0];
    // Shift annotations back
    shiftAnnotations(-cur[2], -cur[0]);
    setPadMap(prev => ({ ...prev, [pk]: [0,0,0,0] }));
  }

  // === Data persistence: localStorage for text, IndexedDB for images ===
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("hw_grader_v7") || "{}");
      if (d.students) {
        const loaded = d.students.map((s: any) => ({ ...s, images: [], imageUrls: [] }));
        setStudents(loaded);
        setActiveStudentId(d.activeStudentId || "");
        if (d.grade) setGrade(d.grade);
        if (d.topic) setTopic(d.topic);
        // Restore images from IndexedDB
        loaded.forEach((s: any) => {
          const imgCount = s.imageCount || 0;
          if (imgCount > 0) {
            loadStudentImages(s.id, imgCount).then(urls => {
              const validUrls = urls.filter(u => u);
              if (validUrls.length > 0) {
                setStudents(prev => prev.map(st => st.id === s.id ? { ...st, imageUrls: validUrls } : st));
              }
            });
          }
        });
      }
      if (d.actionMap) setActionMap(d.actionMap);
      if (d.padMap) setPadMap(d.padMap);
      if (d.specialReq) setSpecialReq(d.specialReq);
      if (d.modelText) setModelText(d.modelText);
      // Restore model essay images from IndexedDB
      const modelImgCount = d.modelImageCount || 0;
      if (modelImgCount > 0) {
        loadModelImages(modelImgCount).then(urls => {
          const valid = urls.filter(u => u);
          if (valid.length > 0) setModelImageUrls(valid);
        });
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      // Save text data + imageCount (not the actual image data)
      const data = {
        students: students.map(s => ({ ...s, images: [], imageUrls: [], imageCount: s.imageUrls.length })),
        activeStudentId, grade, topic, actionMap, padMap, specialReq, modelText,
        modelImageCount: modelImageUrls.length,
      };
      localStorage.setItem("hw_grader_v7", JSON.stringify(data));
    } catch {}
  }, [students, activeStudentId, grade, topic, actionMap, padMap, specialReq, modelText, modelImageUrls]);

  // text wrap helper
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const out: string[] = [];
    for (const raw of text.split("\n")) {
      if (!raw) { out.push(""); continue; }
      let cur = "";
      for (const ch of raw) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; }
      if (cur) out.push(cur);
    }
    return out;
  }

  // ===== redraw (draws hover indicator on canvas instead of DOM) =====
  const redraw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.width / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const acts = actionMap[pk] || [];
    for (let idx = 0; idx < acts.length; idx++) {
      if (idx === editIdx && textPos) continue;
      const a = acts[idx];
      ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.lineWidth; ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (a.type === "pen" && a.points && a.points.length > 1) { ctx.beginPath(); ctx.moveTo(a.points[0].x, a.points[0].y); for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x, a.points[i].y); ctx.stroke(); }
      else if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) { const rx = Math.abs(a.w) / 2, ry = Math.abs(a.h) / 2; if (rx > 0 && ry > 0) { ctx.beginPath(); ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); } }
      else if (a.type === "text" && a.x != null && a.y != null && a.text) {
        const fs = a.fontSize || 18; ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; ctx.textBaseline = "top";
        const mw = a.w || (cssW - a.x - 10); const lines = wrapText(ctx, a.text, mw > 20 ? mw : 200);
        // Draw semi-transparent white background behind text for readability
        const textH = lines.length * fs * 1.4;
        let maxLineW = 0; for (const l of lines) maxLineW = Math.max(maxLineW, ctx.measureText(l).width);
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.fillRect(a.x - 2, a.y - 1, maxLineW + 4, textH + 2);
        ctx.fillStyle = a.color;
        for (let li = 0; li < lines.length; li++) ctx.fillText(lines[li], a.x, a.y + li * (fs * 1.4));
      }
      else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { ctx.beginPath(); let wx = Math.min(a.x, a.endX); const mx = Math.max(a.x, a.endX); ctx.moveTo(wx, a.y); while (wx < mx) { ctx.quadraticCurveTo(wx + 4, a.y - 5, wx + 8, a.y); ctx.quadraticCurveTo(wx + 12, a.y + 5, wx + 16, a.y); wx += 16; } ctx.stroke(); }
    }
    // Draw hover move indicator on canvas (no DOM flicker)
    if (hoverIdx >= 0 && movingIdx < 0 && !textPos && tool !== "hand") {
      const ha = acts[hoverIdx];
      if (ha) {
        const b = getActionBounds(ha);
        if (b) {
          // Dashed border around hovered item
          ctx.strokeStyle = "rgba(44,62,107,0.35)"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
          ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
          ctx.setLineDash([]);
          // Move button at top-right of bounding box
          const bx = b.x + b.w + 6, by = b.y - 4;
          ctx.fillStyle = "rgba(44,62,107,0.9)";
          // Compatible roundRect (works in all browsers)
          const r = 5, bw = 26, bh = 24;
          ctx.beginPath();
          ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by); ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
          ctx.lineTo(bx + bw, by + bh - r); ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
          ctx.lineTo(bx + r, by + bh); ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
          ctx.lineTo(bx, by + r); ctx.arcTo(bx, by, bx + r, by, r);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "center";
          ctx.fillText("✥", bx + 13, by + 13);
          ctx.textAlign = "start";
        }
      }
    }
  }, [actionMap, pk, editIdx, textPos, hoverIdx, movingIdx, tool]);
  useEffect(() => { redraw(); }, [redraw]);

  function syncCanvas() { const cv = canvasRef.current, im = imgRef.current; if (!cv || !im) return; const imgW = im.clientWidth; const imgH = im.clientHeight; if (!imgW || !imgH) return; const w = imgW + padLeft + padRight, h = imgH + padTop + padBot, dpr = window.devicePixelRatio || 1; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px"; redraw(); }
  useEffect(() => { if (canvasRef.current) syncCanvas(); }, [padTop, padBot, padLeft, padRight]);

  function gp(e: React.MouseEvent) { const cv = canvasRef.current; if (!cv) return { x: 0, y: 0 }; const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pushAct(a: DrawAction) { const prev = actionMap[pk] || []; const next = [...prev, a]; setActionMap(p => ({ ...p, [pk]: next })); const h = histMap[pk] || [prev]; const i = histIdx[pk] ?? 0; const nh = [...h.slice(0, i + 1), next]; setHistMap(p => ({ ...p, [pk]: nh })); setHistIdx(p => ({ ...p, [pk]: nh.length - 1 })); }
  function replaceAct(idx: number, a: DrawAction) { const prev = actionMap[pk] || []; const next = prev.map((old, i) => i === idx ? a : old); setActionMap(p => ({ ...p, [pk]: next })); const h = histMap[pk] || [prev]; const hi = histIdx[pk] ?? 0; const nh = [...h.slice(0, hi + 1), next]; setHistMap(p => ({ ...p, [pk]: nh })); setHistIdx(p => ({ ...p, [pk]: nh.length - 1 })); }
  function deleteAct(idx: number) { const acts = (actionMap[pk] || []).filter((_, i) => i !== idx); setActionMap(pr => ({ ...pr, [pk]: acts })); const h = histMap[pk] || [actionMap[pk] || []]; const hi = histIdx[pk] ?? 0; const nh = [...h.slice(0, hi + 1), acts]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function saveToHistory() { const acts = actionMap[pk] || []; const h = histMap[pk] || []; const idx = histIdx[pk] ?? 0; const nh = [...h.slice(0, idx + 1), [...acts]]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function undo() { const h = histMap[pk], i = histIdx[pk] ?? 0; if (!h || i <= 0) return; setHistIdx(p => ({ ...p, [pk]: i - 1 })); setActionMap(p => ({ ...p, [pk]: h[i - 1] })); }
  function redo() { const h = histMap[pk], i = histIdx[pk] ?? 0; if (!h || i >= h.length - 1) return; setHistIdx(p => ({ ...p, [pk]: i + 1 })); setActionMap(p => ({ ...p, [pk]: h[i + 1] })); }

  function getActionBounds(a: DrawAction) {
    const cv = canvasRef.current; const ctx = cv?.getContext("2d");
    if (a.type === "text" && a.x != null && a.y != null) {
      const fs = a.fontSize || 18;
      let tw = 60, th = fs * 1.4;
      if (ctx) {
        ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`;
        const dpr = window.devicePixelRatio || 1;
        const cssW = cv ? cv.width / dpr : 700;
        const mw = a.w || (cssW - a.x - 10);
        const wrapped = wrapText(ctx, a.text || "", mw > 20 ? mw : 200);
        tw = a.w || Math.max(...wrapped.map(l => ctx.measureText(l).width), 30);
        th = wrapped.length * fs * 1.4;
      }
      return { x: a.x, y: a.y, w: tw, h: th };
    }
    if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) return { x: a.x, y: a.y, w: a.w, h: a.h };
    if (a.type === "pen" && a.points && a.points.length > 0) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of a.points) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); } return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
    if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { const mn = Math.min(a.x, a.endX); return { x: mn, y: a.y - 8, w: Math.abs(a.endX - a.x), h: 16 }; }
    return null;
  }

  // Check if point is on the hover move button
  function isOnMoveBtn(px: number, py: number): number {
    const acts = actionMap[pk] || [];
    for (let i = acts.length - 1; i >= 0; i--) {
      const b = getActionBounds(acts[i]);
      if (b) {
        const bx = b.x + b.w + 6, by = b.y - 4;
        if (px >= bx && px <= bx + 26 && py >= by && py <= by + 24) return i;
      }
    }
    return -1;
  }

  // Mouse
  function mDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const p = gp(e);
    if (movingIdx >= 0) { saveToHistory(); setMovingIdx(-1); return; }
    // Check if clicking on the canvas-drawn move button
    if (hoverIdx >= 0 && movingIdx < 0) {
      const btnHit = isOnMoveBtn(p.x, p.y);
      if (btnHit >= 0) {
        const a = (actionMap[pk] || [])[btnHit]; if (!a) return;
        const b = getActionBounds(a); if (!b) return;
        setMovingIdx(btnHit); setMovingOffset({ x: p.x - b.x, y: p.y - b.y });
        return;
      }
    }
    if (pendingStamp) { pushAct({ type: "text", color: pendingStamp.color, lineWidth: penWidth, x: p.x, y: p.y, text: pendingStamp.label, fontSize }); setPendingStamp(null); return; }
    if (tool === "hand") {
      const wrap = document.getElementById("canvas-wrap");
      if (wrap) { setHandDragging(true); setHandStart({ x: e.clientX, y: e.clientY, scrollX: wrap.scrollLeft, scrollY: wrap.scrollTop }); }
      return;
    }
    if (tool === "pen") { setIsDrawing(true); setCurPoints([p]); }
    else if (tool === "circle" || tool === "wavy") { setIsDrawing(true); setDrawStart(p); }
    else if (tool === "text") {
      if (textClickTimer.current) clearTimeout(textClickTimer.current);
      if (textPos) { commitText(); setTool("pen"); return; }
      const clickP = { ...p };
      textClickTimer.current = setTimeout(() => {
        setEditIdx(-1); setTextPos({ x: clickP.x, y: clickP.y }); setTextVal(""); setTextBoxW(220);
        setTimeout(() => txtRef.current?.focus(), 30);
      }, 250);
    }
    else if (tool === "eraser") { const acts = actionMap[pk] || []; const hi = hitTest(acts, p.x, p.y); if (hi >= 0) deleteAct(hi); }
    else if (tool === "penEraser") { setIsDrawing(true); erasePenAt(p.x, p.y); }
  }
  function mDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    if (textClickTimer.current) { clearTimeout(textClickTimer.current); textClickTimer.current = null; }
    const p = gp(e); const acts = actionMap[pk] || [];
    const hi = hitTestText(acts, p.x, p.y);
    if (hi >= 0) { const a = acts[hi]; setEditIdx(hi); setTextPos({ x: a.x!, y: a.y! }); setTextVal(a.text || ""); setStrokeColor(a.color); setFontSize(a.fontSize || 18); setTextBoxW(a.w ? a.w + 16 : 220); setTool("text"); setTimeout(() => txtRef.current?.focus(), 30); }
  }
  function mMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = gp(e); setMousePos(p);
    if (handDragging) {
      const wrap = document.getElementById("canvas-wrap");
      if (wrap) { wrap.scrollLeft = handStart.scrollX - (e.clientX - handStart.x); wrap.scrollTop = handStart.scrollY - (e.clientY - handStart.y); }
      return;
    }
    if (movingIdx >= 0) {
      const acts = [...(actionMap[pk] || [])]; const a = { ...acts[movingIdx] };
      const dx = p.x - movingOffset.x, dy = p.y - movingOffset.y;
      if (a.type === "pen" && a.points) { const o = acts[movingIdx].points![0]; a.points = a.points.map(pt => ({ x: pt.x + (dx - o.x), y: pt.y + (dy - o.y) })); }
      else if (a.type === "circle" || a.type === "text") { a.x = dx; a.y = dy; }
      else if (a.type === "wavy") { const w = (a.endX || 0) - (a.x || 0); a.x = dx; a.y = dy; a.endX = dx + w; }
      acts[movingIdx] = a; setActionMap(pr => ({ ...pr, [pk]: acts })); return;
    }
    // hover detect (extended right side to cover the move button area)
    const acts = actionMap[pk] || []; let found = -1;
    for (let i = acts.length - 1; i >= 0; i--) { const b = getActionBounds(acts[i]); if (b && p.x >= b.x - 10 && p.x <= b.x + b.w + 40 && p.y >= b.y - 10 && p.y <= b.y + b.h + 10) { found = i; break; } }
    setHoverIdx(found);
    if (!isDrawing) return;
    const cv = canvasRef.current; if (!cv) return; const ctx = cv.getContext("2d"); if (!ctx) return; const dpr = window.devicePixelRatio || 1;
    if (tool === "pen") { setCurPoints(prev => [...prev, p]); redraw(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth; ctx.lineCap = "round"; ctx.lineJoin = "round"; const pts = [...curPoints, p]; if (pts.length > 1) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); } }
    else if (tool === "circle") { redraw(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth; const w = p.x - drawStart.x, h = p.y - drawStart.y; const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2; if (rx > 2 && ry > 2) { ctx.beginPath(); ctx.ellipse(drawStart.x + w / 2, drawStart.y + h / 2, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); } }
    else if (tool === "wavy") { redraw(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.strokeStyle = strokeColor; ctx.lineWidth = penWidth; ctx.beginPath(); let wx = Math.min(drawStart.x, p.x); const mx = Math.max(drawStart.x, p.x); ctx.moveTo(wx, drawStart.y); while (wx < mx) { ctx.quadraticCurveTo(wx + 4, drawStart.y - 5, wx + 8, drawStart.y); ctx.quadraticCurveTo(wx + 12, drawStart.y + 5, wx + 16, drawStart.y); wx += 16; } ctx.stroke(); }
    else if (tool === "penEraser" && isDrawing) { erasePenAt(p.x, p.y); }
  }
  function mUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (handDragging) { setHandDragging(false); return; }
    if (movingIdx >= 0) return; if (!isDrawing) return; setIsDrawing(false); const p = gp(e);
    if (tool === "pen" && curPoints.length > 1) { pushAct({ type: "pen", color: strokeColor, lineWidth: penWidth, points: [...curPoints, p] }); setCurPoints([]); }
    else if (tool === "circle") { const w = p.x - drawStart.x, h = p.y - drawStart.y; if (Math.abs(w) > 5 && Math.abs(h) > 5) pushAct({ type: "circle", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, w, h }); }
    else if (tool === "wavy") { if (Math.abs(p.x - drawStart.x) > 10) pushAct({ type: "wavy", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, endX: p.x }); }
    else if (tool === "penEraser") { saveToHistory(); }
  }
  function commitText() {
    if (textVal.trim() && textPos) { const ta = txtRef.current; const bw = ta ? ta.offsetWidth - 16 : undefined; const act: DrawAction = { type: "text", color: strokeColor, lineWidth: penWidth, x: textPos.x, y: textPos.y, text: textVal, fontSize, w: bw }; if (editIdx >= 0) replaceAct(editIdx, act); else pushAct(act); }
    else if (editIdx >= 0 && !textVal.trim()) deleteAct(editIdx);
    setTextPos(null); setTextVal(""); setEditIdx(-1);
  }

  function erasePenAt(cx: number, cy: number) {
    const R = 10; const acts = actionMap[pk] || []; const newActs = [...acts]; let changed = false;
    for (let i = newActs.length - 1; i >= 0; i--) {
      const a = newActs[i];
      if (a.type === "pen" && a.points) {
        const remaining = a.points.filter(p => Math.abs(p.x - cx) > R || Math.abs(p.y - cy) > R);
        if (remaining.length !== a.points.length) { changed = true; if (remaining.length < 2) newActs.splice(i, 1); else newActs[i] = { ...a, points: remaining }; }
      }
    }
    if (changed) setActionMap(pr => ({ ...pr, [pk]: newActs }));
  }

  function hitTest(acts: DrawAction[], cx: number, cy: number) {
    const R = 20; const cv = canvasRef.current; const ctx = cv?.getContext("2d");
    for (let i = acts.length - 1; i >= 0; i--) { const a = acts[i];
      if (a.type === "pen" && a.points) { for (const p of a.points) if (Math.abs(p.x - cx) < R && Math.abs(p.y - cy) < R) return i; }
      else if (a.type === "circle" && a.x != null && a.w != null && a.y != null && a.h != null) { if (Math.abs(a.x + a.w / 2 - cx) < Math.abs(a.w) / 2 + R && Math.abs(a.y + a.h / 2 - cy) < Math.abs(a.h) / 2 + R) return i; }
      else if (a.type === "text" && a.x != null && a.y != null) { const fs = a.fontSize || 18; const lines = (a.text || "").split("\n"); let tw = a.w || 60; if (ctx) { ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; tw = a.w || Math.max(...lines.map(l => ctx.measureText(l).width), 30); } if (cx > a.x - R && cx < a.x + tw + R && cy > a.y - 10 && cy < a.y + lines.length * fs * 1.4 + 10) return i; }
      else if (a.type === "wavy" && a.x != null && a.endX != null && a.y != null) { if (cx > Math.min(a.x, a.endX) - R && cx < Math.max(a.x, a.endX) + R && Math.abs(cy - a.y) < R) return i; }
    } return -1;
  }
  function hitTestText(acts: DrawAction[], cx: number, cy: number) {
    const cv = canvasRef.current; const ctx = cv?.getContext("2d");
    for (let i = acts.length - 1; i >= 0; i--) { const a = acts[i]; if (a.type === "text" && a.x != null && a.y != null) { const fs = a.fontSize || 18; const lines = (a.text || "").split("\n"); let tw = a.w || 60; if (ctx) { ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; tw = a.w || Math.max(...lines.map(l => ctx.measureText(l).width), 30); } if (cx > a.x - 5 && cx < a.x + tw + 5 && cy > a.y - 5 && cy < a.y + lines.length * fs * 1.4 + 5) return i; } }
    return -1;
  }

  // Export (high quality, auto-crop empty padding)
  function exportOnePNG(studentId: string, pIdx: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      const stu = students.find(s => s.id === studentId); if (!stu || !stu.imageUrls[pIdx]) { resolve(null); return; }
      const pPad = padMap[studentId + "_" + pIdx] || [0,0,0,0];
      const acts = actionMap[studentId + "_" + pIdx] || [];
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const cv = canvasRef.current; const displayImgW = cv ? parseFloat(cv.style.width) - pPad[2] - pPad[3] : img.naturalWidth;
        const scale = img.naturalWidth / (displayImgW || img.naturalWidth);

        // Find the bounding box of all content (image + annotations)
        let contentRight = img.naturalWidth + pPad[2] * scale;
        let contentBottom = img.naturalHeight + pPad[0] * scale;
        for (const a of acts) {
          const b = getActionBounds(a);
          if (b) {
            contentRight = Math.max(contentRight, (b.x + b.w) * scale + 10);
            contentBottom = Math.max(contentBottom, (b.y + b.h) * scale + 10);
          }
        }
        // Canvas size: just enough to fit image + annotations, no extra empty padding
        const totalW = Math.max(contentRight, img.naturalWidth);
        const totalH = Math.max(contentBottom, img.naturalHeight + pPad[0] * scale);

        const m = document.createElement("canvas"); m.width = totalW; m.height = totalH;
        const ctx = m.getContext("2d"); if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, totalW, totalH);
        ctx.drawImage(img, pPad[2] * scale, pPad[0] * scale);
        for (const a of acts) {
          ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.lineWidth * scale; ctx.lineCap = "round"; ctx.lineJoin = "round";
          if (a.type === "pen" && a.points && a.points.length > 1) { ctx.beginPath(); ctx.moveTo(a.points[0].x * scale, a.points[0].y * scale); for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x * scale, a.points[i].y * scale); ctx.stroke(); }
          else if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) { const rx = Math.abs(a.w * scale) / 2, ry = Math.abs(a.h * scale) / 2; if (rx > 0 && ry > 0) { ctx.beginPath(); ctx.ellipse((a.x + a.w / 2) * scale, (a.y + a.h / 2) * scale, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); } }
          else if (a.type === "text" && a.x != null && a.y != null && a.text) { const fs = (a.fontSize || 18) * scale; ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; ctx.textBaseline = "top"; const mw = a.w ? a.w * scale : (totalW - a.x * scale - 10); const lines = wrapText(ctx, a.text, mw > 20 ? mw : 200); const textH = lines.length * fs * 1.4; let maxLW = 0; for (const l of lines) maxLW = Math.max(maxLW, ctx.measureText(l).width); ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fillRect(a.x * scale - 2, a.y * scale - 1, maxLW + 4, textH + 2); ctx.fillStyle = a.color; for (let li = 0; li < lines.length; li++) ctx.fillText(lines[li], a.x * scale, a.y * scale + li * (fs * 1.4)); }
          else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { ctx.beginPath(); let wx = Math.min(a.x, a.endX) * scale; const mx = Math.max(a.x, a.endX) * scale; const wy = a.y * scale; ctx.moveTo(wx, wy); const step = 16 * scale; while (wx < mx) { ctx.quadraticCurveTo(wx + step * 0.25, wy - 5 * scale, wx + step * 0.5, wy); ctx.quadraticCurveTo(wx + step * 0.75, wy + 5 * scale, wx + step, wy); wx += step; } ctx.stroke(); }
        }
        m.toBlob(blob => resolve(blob), "image/png");
      };
      img.onerror = () => resolve(null); img.src = stu.imageUrls[pIdx];
    });
  }
  function exportPNG() { if (!activeStudent) return; exportOnePNG(activeStudentId, pageIndex).then(blob => { if (!blob) return; const link = document.createElement("a"); link.download = "批注_" + activeStudent.name + "_" + (pageIndex + 1) + ".png"; link.href = URL.createObjectURL(blob); link.click(); }); }
  // Copy image to clipboard (for pasting into WeChat)
  async function copyImageToClipboard() {
    if (!activeStudent) return;
    const blob = await exportOnePNG(activeStudentId, pageIndex);
    if (!blob) { alert("导出失败"); return; }
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopyMsg("已复制图片，可粘贴到微信"); setTimeout(() => setCopyMsg(""), 2000);
    } catch { alert("复制失败，请使用导出按钮下载后发送"); }
  }
  async function exportAllPNGs() { const done = students.filter(s => s.status === "done"); if (done.length === 0) { alert("没有已批改的学生"); return; } for (const stu of done) { for (let i = 0; i < stu.imageUrls.length; i++) { const blob = await exportOnePNG(stu.id, i); if (blob) { const link = document.createElement("a"); link.download = stu.name + "_" + (i + 1) + ".png"; link.href = URL.createObjectURL(blob); link.click(); await new Promise(r => setTimeout(r, 300)); } } } }

  // === Data export/import (backup & restore) ===
  function exportData() {
    const data = { students: students.map(s => ({ ...s, images: [] })), actionMap, padMap, grade, topic, version: "v5" };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const link = document.createElement("a"); link.download = "批改数据_" + new Date().toLocaleDateString("zh-CN") + ".json"; link.href = URL.createObjectURL(blob); link.click();
  }
  const importFileRef = useRef<HTMLInputElement>(null);
  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.students) { setStudents(data.students.map((s: any) => ({ ...s, images: [] }))); setActiveStudentId(data.students[0]?.id || ""); }
        if (data.actionMap) setActionMap(data.actionMap);
        if (data.padMap) setPadMap(data.padMap);
        if (data.grade) setGrade(data.grade);
        if (data.topic) setTopic(data.topic);
        setCopyMsg("数据导入成功！"); setTimeout(() => setCopyMsg(""), 2000);
      } catch { alert("数据文件格式错误"); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  useEffect(() => { function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape" && textPos) { setTextPos(null); setTextVal(""); setEditIdx(-1); } return; }
    if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.key === "Escape") { if (movingIdx >= 0) setMovingIdx(-1); if (textPos) { setTextPos(null); setTextVal(""); setEditIdx(-1); } }
    const toolKeys: Record<string, Tool> = { "1": "pen", "2": "hand", "3": "text", "4": "circle", "5": "wavy", "6": "eraser", "7": "penEraser" };
    if (toolKeys[e.key] && !e.ctrlKey && !e.metaKey) { setTool(toolKeys[e.key]); setTextPos(null); setPendingStamp(null); setMovingIdx(-1); }
  } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); });

  // Student management (with IndexedDB image save)
  function addStudent() { if (!newName.trim()) { alert("请输入学生姓名"); return; } const s: Student = { id: uid(), name: newName.trim(), images: [], imageUrls: [], ocrText: "", essayDetail: null, report: "", status: "idle" }; setStudents(prev => [...prev, s]); setActiveStudentId(s.id); setNewName(""); }
  function removeStudent(id: string) { const stu = students.find(s => s.id === id); deleteStudentImages(id, stu?.imageUrls.length || 10); setStudents(prev => prev.filter(s => s.id !== id)); if (activeStudentId === id) setActiveStudentId(students.find(s => s.id !== id && !s.archived)?.id || ""); setLoading(false); setProgress(0); setStepText(""); setBatchStatus(""); }
  function archiveStudent(id: string) { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: true } : s)); if (activeStudentId === id) setActiveStudentId(students.find(s => s.id !== id && !s.archived)?.id || ""); }
  function unarchiveStudent(id: string) { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: false } : s)); }
  // Convert File to base64 data URL
  function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  // Compress image to reduce size for API upload (max 1200px wide, JPEG quality 0.7)
  function compressImage(file: File, maxWidth = 1200, quality = 0.7): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(URL.createObjectURL(file)); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => resolve(URL.createObjectURL(file));
      img.src = URL.createObjectURL(file);
    });
  }
  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (files.length === 0 || !activeStudentId) return;
    const stu = students.find(s => s.id === activeStudentId);
    const existingCount = stu?.imageUrls.length || 0;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const dataUrl = await compressImage(files[i]);
      dataUrls.push(dataUrl);
      await saveOneImage(activeStudentId, existingCount + i, dataUrl);
    }
    setStudents(prev => prev.map(s => s.id !== activeStudentId ? s : { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...dataUrls] }));
    e.target.value = "";
  }
  async function onDropImages(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragOver(false); if (!activeStudentId) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length === 0) return;
    const stu = students.find(s => s.id === activeStudentId);
    const existingCount = stu?.imageUrls.length || 0;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const dataUrl = await compressImage(files[i]);
      dataUrls.push(dataUrl);
      await saveOneImage(activeStudentId, existingCount + i, dataUrl);
    }
    setStudents(prev => prev.map(s => s.id !== activeStudentId ? s : { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...dataUrls] }));
  }
  function removeImage(sid: string, idx: number) { setStudents(prev => prev.map(s => { if (s.id !== sid) return s; return { ...s, images: s.images.filter((_, i) => i !== idx), imageUrls: s.imageUrls.filter((_, i) => i !== idx) }; })); }
  function updateStudent(id: string, d: Partial<Student>) { setStudents(prev => prev.map(s => s.id === id ? { ...s, ...d } : s)); }

  // === Model essay (范文) image handlers ===
  async function onPickModelImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (files.length === 0) return;
    const existingCount = modelImageUrls.length;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const url = await compressImage(files[i]);
      dataUrls.push(url);
      await saveModelImage(existingCount + i, url);
    }
    setModelFiles(prev => [...prev, ...files]);
    setModelImageUrls(prev => [...prev, ...dataUrls]);
    e.target.value = "";
  }
  async function onDropModelImages(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setModelDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length === 0) return;
    const existingCount = modelImageUrls.length;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const url = await compressImage(files[i]);
      dataUrls.push(url);
      await saveModelImage(existingCount + i, url);
    }
    setModelFiles(prev => [...prev, ...files]);
    setModelImageUrls(prev => [...prev, ...dataUrls]);
  }
  async function removeModelImage(idx: number) {
    const newUrls = modelImageUrls.filter((_, i) => i !== idx);
    setModelFiles(prev => prev.filter((_, i) => i !== idx));
    setModelImageUrls(newUrls);
    setModelText("");
    // Re-save all model images to IndexedDB with correct indices
    await clearModelImages(modelImageUrls.length);
    for (let i = 0; i < newUrls.length; i++) {
      await saveModelImage(i, newUrls[i]);
    }
  }

  // Grading with error recovery
  async function gradeOneStudent(sid: string, onP?: (p: number, t: string) => void) {
    const stu = students.find(s => s.id === sid); if (!stu || stu.images.length === 0 && stu.imageUrls.length === 0) return;
    updateStudent(sid, { status: "grading", errorMsg: undefined });
    try {
      // Step 1: OCR model essay if needed (only first time)
      // Split into batches of 2 images to avoid FUNCTION_PAYLOAD_TOO_LARGE
      let modelAnalysis = modelText;
      if (modelImageUrls.length > 0 && !modelText) {
        onP?.(5, "正在识别范文...");
        const BATCH_SIZE = 2;
        const ocrParts: string[] = [];
        for (let bi = 0; bi < modelImageUrls.length; bi += BATCH_SIZE) {
          const batch = modelImageUrls.slice(bi, bi + BATCH_SIZE);
          onP?.(5 + Math.round((bi / modelImageUrls.length) * 10), `正在识别范文（${bi + 1}-${Math.min(bi + BATCH_SIZE, modelImageUrls.length)}/${modelImageUrls.length}张）...`);
          const mfd = new FormData();
          for (const url of batch) {
            const res = await fetch(url); const blob = await res.blob();
            mfd.append("images", new File([blob], "model.jpg", { type: "image/jpeg" }));
          }
          const mr = await fetch("/api/ocr", { method: "POST", body: mfd });
          if (mr.ok) {
            const { ocrText: partOcr } = await mr.json();
            if (partOcr) ocrParts.push(partOcr);
          }
        }
        const modelOcr = ocrParts.join("\n\n");
        if (modelOcr.trim()) {
          onP?.(15, "范文识别完成，正在分析范文...");
          const mr2 = await fetch("/api/essay-detail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ocrText: modelOcr, gradeInfo: grade + " " + topic, isModelEssay: true }) });
          if (mr2.ok) {
            const analysis = await mr2.json();
            modelAnalysis = typeof analysis === "string" ? analysis : JSON.stringify(analysis, null, 2);
            setModelText(modelAnalysis);
          }
        }
      }

      // Step 2: OCR student essay (batch 2 images at a time)
      onP?.(25, "正在OCR识别学生作文...");
      const imgSources: { blob: Blob; name: string }[] = [];
      if (stu.images.length > 0) {
        for (const f of stu.images) imgSources.push({ blob: f, name: f.name });
      } else {
        for (const url of stu.imageUrls) { const res = await fetch(url); const blob = await res.blob(); imgSources.push({ blob, name: "image.jpg" }); }
      }
      const stuOcrParts: string[] = [];
      const STU_BATCH = 2;
      for (let bi = 0; bi < imgSources.length; bi += STU_BATCH) {
        const batch = imgSources.slice(bi, bi + STU_BATCH);
        if (imgSources.length > STU_BATCH) onP?.(25 + Math.round((bi / imgSources.length) * 25), `正在识别第${bi + 1}-${Math.min(bi + STU_BATCH, imgSources.length)}/${imgSources.length}页...`);
        const fd = new FormData();
        for (const src of batch) fd.append("images", new File([src.blob], src.name, { type: src.blob.type || "image/jpeg" }));
        const r1 = await fetch("/api/ocr", { method: "POST", body: fd });
        if (!r1.ok) { const t = await r1.text(); throw new Error("OCR失败: " + (t || r1.statusText)); }
        const { ocrText: partOcr } = await r1.json();
        if (partOcr) stuOcrParts.push(partOcr);
      }
      const ocrText = stuOcrParts.join("\n\n");
      updateStudent(sid, { ocrText });

      // Step 3: AI grading with model + special requirements
      onP?.(55, "文字识别完成，正在AI精批...");
      const r2 = await fetch("/api/essay-detail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ocrText, gradeInfo: grade + " " + topic, modelAnalysis: modelAnalysis || undefined, specialRequirement: specialReq || undefined }) });
      if (!r2.ok) { const t = await r2.text(); throw new Error("精批失败: " + (t || r2.statusText)); }
      const essayDetail = await r2.json(); updateStudent(sid, { essayDetail, status: "done" });
      onP?.(100, "批改完成！");
    } catch (err: any) { updateStudent(sid, { status: "error", errorMsg: err.message || "未知错误" }); throw err; }
  }
  async function runGrading() { if (!activeStudent || (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0)) { alert("请先上传作业照片"); return; } setLoading(true); setProgress(0); setStepText("准备中..."); try { await gradeOneStudent(activeStudentId, (p, t) => { setProgress(p); setStepText(t); }); setTab("detail"); } catch (err: any) { /* error stored in student */ } finally { setLoading(false); } }
  async function retryGrading(sid: string) { setLoading(true); setProgress(0); setStepText("重试中..."); try { await gradeOneStudent(sid, (p, t) => { setProgress(p); setStepText(t); }); setTab("detail"); } catch {} finally { setLoading(false); } }
  async function runBatchGrading() { const toGrade = students.filter(s => (s.images.length > 0 || s.imageUrls.length > 0) && s.status !== "done"); if (toGrade.length === 0) { alert("没有待批改的学生"); return; } setLoading(true); let done = 0; for (const stu of toGrade) { setBatchStatus(`正在批改 ${stu.name}（${done + 1}/${toGrade.length}）...`); const base = Math.round((done / toGrade.length) * 100); try { await gradeOneStudent(stu.id, (p) => { setProgress(base + Math.round((p / 100) * (100 / toGrade.length))); }); } catch {} done++; } setProgress(100); setBatchStatus(`全部完成！共批改 ${done} 位学生`); setLoading(false); setTab("detail"); setTimeout(() => setBatchStatus(""), 3000); }

  // Copy helpers
  function clipCopy(text: string, msg?: string) { navigator.clipboard.writeText(text).then(() => { setCopyMsg(msg || "已复制！"); setTimeout(() => setCopyMsg(""), 1500); }); }
  function copyOneCorrection(c: any) { clipCopy(c.text, "已复制批注"); }
  function copyOneSuggested(c: any) { clipCopy(c.suggested, "已复制建议"); }
  function copyAllHighlights() { if (!activeStudent?.essayDetail?.highlights) return; clipCopy(activeStudent.essayDetail.highlights.map((h: any, i: number) => `${i + 1}. ${h.title}：${h.description}`).join("\n"), "已复制亮点"); }
  function copyAllTips() { if (!activeStudent?.essayDetail?.improvement_tips) return; clipCopy(activeStudent.essayDetail.improvement_tips.join("\n"), "已复制改进方向"); }
  function copyTeacherComment() { if (!activeStudent?.essayDetail?.teacher_comment) return; clipCopy(activeStudent.essayDetail.teacher_comment, "已复制总评"); }
  function copyAllDetail() { if (!activeStudent?.essayDetail) return; const d = activeStudent.essayDetail; let t = `【${activeStudent.name} 作文批改】\n\n━━ 批注 ━━\n`; (d.corrections || []).forEach((c: any, i: number) => { t += `${i + 1}. [${c.paragraph}] ${c.text}${c.suggested ? " → " + c.suggested : ""}\n`; }); t += `\n━━ 亮点 ━━\n`; (d.highlights || []).forEach((h: any, i: number) => { t += `${i + 1}. ${h.title}：${h.description}\n`; }); const lb: Record<string, string> = { content: "内容", structure: "结构", language: "语言", writing: "书写" }; if (d.dimensions) { t += `\n━━ 四维评价 ━━\n`; Object.entries(d.dimensions as Record<string, string>).forEach(([k, v]) => { t += `${lb[k] || k}：${v}\n`; }); } if (d.teacher_comment) t += `\n━━ 教师总评 ━━\n${d.teacher_comment}\n`; if (d.improvement_tips) { t += `\n━━ 改进方向 ━━\n`; d.improvement_tips.forEach((tip: string) => t += `${tip}\n`); } clipCopy(t, "已复制全部"); }
  function generateParentNotice() { if (!activeStudent?.essayDetail) return; const d = activeStudent.essayDetail; const name = activeStudent.name; let t = `【${name}作文反馈】\n✨ 亮点：${(d.highlights || []).map((h: any) => h.title).join("、")}\n📝 需改进${(d.corrections || []).filter((c: any) => c.type === "fix").length}处，已在作文上标注\n`; if (d.teacher_comment) t += `💬 ${d.teacher_comment.slice(0, 60)}${d.teacher_comment.length > 60 ? "..." : ""}\n`; t += `请家长督促孩子看批注并改正，感谢配合！`; setParentNotice(t); }

  // Styles
  function tabStyle(t: TabName) { return { padding: "10px 24px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer" as const, fontWeight: 600 as const, fontSize: "15px", background: tab === t ? "#fff" : "transparent", color: tab === t ? PRIMARY : "#999", borderBottom: tab === t ? "2px solid " + PRIMARY : "2px solid transparent" }; }
  const toolDefs: { k: Tool; l: string; ic: string; key: string }[] = [{ k: "pen", l: "画笔 (1)", ic: "✏️", key: "1" }, { k: "hand", l: "拖拽 (2)", ic: "🖐", key: "2" }, { k: "text", l: "文字 (3)", ic: "T", key: "3" }, { k: "circle", l: "圆圈 (4)", ic: "⭕", key: "4" }, { k: "wavy", l: "波浪线 (5)", ic: "〰", key: "5" }, { k: "eraser", l: "整体删除 (6)", ic: "🧹", key: "6" }, { k: "penEraser", l: "局部擦除 (7)", ic: "🩹", key: "7" }];
  const cpBtnS: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: "2px 6px", borderRadius: 4 };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Noto Sans SC','Microsoft YaHei',sans-serif", color: "#333" }}>
      {previewUrl && <div onClick={() => setPreviewUrl(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}><button onClick={() => setPreviewUrl(null)} style={{ position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}>✕</button><img src={previewUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} /></div>}
      {parentNotice !== null && <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "90%" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>📱 家长通知</h3><button onClick={() => setParentNotice(null)} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#999" }}>✕</button></div><pre style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.8, color: "#444", background: "#f0faf0", padding: 14, borderRadius: 8, marginBottom: 14, border: "1px solid #d0e8d0" }}>{parentNotice}</pre><div style={{ display: "flex", gap: 8 }}><button onClick={() => { navigator.clipboard.writeText(parentNotice); setCopyMsg("已复制通知"); setTimeout(() => setCopyMsg(""), 1500); }} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: GREEN, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{copyMsg === "已复制通知" ? "✅ 已复制" : "📋 复制"}</button><button onClick={() => setParentNotice(null)} style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1px solid #ddd", background: "#fff", color: "#666", fontSize: 14, cursor: "pointer" }}>关闭</button></div></div></div>}
      {copyMsg && !parentNotice && <div style={{ position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: GREEN, color: "#fff", padding: "8px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>✅ {copyMsg}</div>}

      <div style={{ background: "linear-gradient(135deg," + PRIMARY + ",#1a2744)", padding: isMobile ? "10px 16px" : "14px 32px", color: "#fff", display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: isMobile ? 8 : 0 }}>
        <div><h1 style={{ margin: 0, fontSize: isMobile ? "16px" : "20px", fontWeight: 700, letterSpacing: 2 }}>语文作业智能批改</h1>{!isMobile && <p style={{ margin: "2px 0 0", fontSize: "12px", opacity: 0.7 }}>上传照片 → AI自动批注 → 微调导出</p>}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={runBatchGrading} disabled={loading} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: isMobile ? 11 : 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>🚀 批改全部</button>
          <button onClick={exportAllPNGs} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: isMobile ? 11 : 13, fontWeight: 600, cursor: "pointer" }}>📥 导出图片</button>
          <button onClick={exportData} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: isMobile ? 11 : 13, fontWeight: 600, cursor: "pointer" }}>💾 备份</button>
          <button onClick={() => importFileRef.current?.click()} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: isMobile ? 11 : 13, fontWeight: 600, cursor: "pointer" }}>📂 恢复</button>
          <input ref={importFileRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        </div>
      </div>
      {batchStatus && <div style={{ background: "#edf9f1", padding: "10px 32px", fontSize: 14, fontWeight: 600, color: GREEN, borderBottom: "1px solid #d0e8d8" }}>{batchStatus}</div>}

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "12px 20px" }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e0e0e0", marginBottom: 16 }}><button style={tabStyle("upload")} onClick={() => setTab("upload")}>📤 上传作业</button><button style={tabStyle("detail")} onClick={() => setTab("detail")}>📝 批改详情</button><button style={tabStyle("archive")} onClick={() => setTab("archive")}>📦 储存箱{students.filter(s => s.archived).length > 0 ? ` (${students.filter(s => s.archived).length})` : ""}</button></div>

        {tab === "upload" && (
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24 }}>
            {/* ====== LEFT: Student list + photo upload ====== */}
            <div style={{ width: isMobile ? "100%" : "55%", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}><input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="输入学生姓名" style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #ddd", fontSize: 13, outline: "none" }} /><button onClick={addStudent} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: PRIMARY, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>添加</button></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {students.filter(s => !s.archived).length === 0 && <p style={{ fontSize: 13, color: "#bbb", textAlign: "center", padding: "20px 0" }}>请先添加学生</p>}
                {students.filter(s => !s.archived).map(s => (<div key={s.id} onClick={() => { setActiveStudentId(s.id); setPageIndex(0); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: activeStudentId === s.id ? PRIMARY : "#fff", color: activeStudentId === s.id ? "#fff" : "#333", border: activeStudentId === s.id ? "none" : "1px solid #eee" }}>
                  <div><span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span><span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: s.status === "done" ? GREEN : s.status === "grading" ? "#f39c12" : s.status === "error" ? RED : "#eee", color: s.status === "idle" ? "#999" : "#fff" }}>{s.status === "done" ? "已批改" : s.status === "grading" ? "批改中" : s.status === "error" ? "出错" : (s.images.length || s.imageUrls.length) + "张"}</span></div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {s.status === "error" && <button onClick={e => { e.stopPropagation(); retryGrading(s.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: activeStudentId === s.id ? "#ffd" : ORANGE, fontSize: 12, fontWeight: 600 }}>🔄</button>}
                    {s.status === "done" && <button onClick={e => { e.stopPropagation(); archiveStudent(s.id); }} title="归档" style={{ background: "transparent", border: "none", cursor: "pointer", color: activeStudentId === s.id ? "rgba(255,255,255,0.7)" : "#aaa", fontSize: 13 }}>📦</button>}
                    <button onClick={e => { e.stopPropagation(); removeStudent(s.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: activeStudentId === s.id ? "rgba(255,255,255,0.6)" : "#ccc", fontSize: 16 }}>✕</button>
                  </div>
                </div>))}
              </div>
              {/* Photo upload for selected student */}
              {activeStudent && <>
                <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#555" }}>{activeStudent.name} 的作业照片</h4>
                {activeStudent.status === "error" && <div style={{ background: "#fef2f2", border: "1px solid #f0c0c0", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                  <span style={{ color: RED }}>❌ {activeStudent.errorMsg || "出错"}</span>
                  <button onClick={() => retryGrading(activeStudent.id)} disabled={loading} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: ORANGE, color: "#fff", fontSize: 12, cursor: "pointer" }}>🔄 重试</button>
                </div>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 12, borderRadius: 10, border: dragOver ? "2px dashed " + PRIMARY : "1px dashed #ccc", background: dragOver ? "#e8ecf4" : "#fafafa", marginBottom: 12 }} onDrop={onDropImages} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }} onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}>
                  {activeStudent.imageUrls.map((url, i) => (<div key={i} onClick={() => setPreviewUrl(url)} style={{ width: 80, height: 105, borderRadius: 6, overflow: "hidden", border: "1px solid #ddd", position: "relative", cursor: "pointer", flexShrink: 0 }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button onClick={e => { e.stopPropagation(); removeImage(activeStudent.id, i); }} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button><div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 9, textAlign: "center", padding: 2 }}>{"第" + (i + 1) + "页"}</div></div>))}
                  <div onClick={() => addFileInputRef.current?.click()} style={{ width: 80, height: 105, borderRadius: 6, border: "2px dashed #ccc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fff", color: "#bbb", flexShrink: 0 }}><span style={{ fontSize: 24 }}>+</span><span style={{ fontSize: 10 }}>拖拽或点击</span><input ref={addFileInputRef} type="file" accept="image/*" multiple onChange={onPickImages} style={{ display: "none" }} /></div>
                </div>
              </>}
            </div>

            {/* ====== RIGHT: Global grading settings ====== */}
            <div style={{ flex: 1, padding: 20, borderRadius: 12, border: "1px solid #e0e0e0", background: "#fff", alignSelf: "flex-start" }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: PRIMARY, margin: "0 0 14px" }}>⚙️ 批改设置</h3>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 }}>年级</label><select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}>{["一年级上","一年级下","二年级上","二年级下","三年级上","三年级下","四年级上","四年级下","五年级上","五年级下","六年级上","六年级下"].map(g => <option key={g}>{g}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 }}>主题</label><select value={topic} onChange={e => setTopic(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}>{["看图写话","写人","记事","写景","状物","想象作文","日记","书信","读后感","中华传统节日","自由命题","童话","其他"].map(t => <option key={t}>{t}</option>)}</select></div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 4 }}>📝 特殊要求（选填）</label>
                <textarea value={specialReq} onChange={e => setSpecialReq(e.target.value)} placeholder="例如：这次写童话，注意想象力和拟人手法…" style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 12, minHeight: 40, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#888", display: "block", marginBottom: 6 }}>📄 范文模板（选填，可拖拽多张）</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, borderRadius: 8, border: modelDragOver ? "2px dashed " + PRIMARY : "1px dashed #ccc", background: modelDragOver ? "#e8ecf4" : "#fafafa", minHeight: 50 }}
                  onDrop={onDropModelImages} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setModelDragOver(true); }} onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setModelDragOver(false); }}>
                  {modelImageUrls.map((url, i) => (
                    <div key={i} onClick={() => setPreviewUrl(url)} style={{ width: 50, height: 65, borderRadius: 4, overflow: "hidden", border: "1px solid #ddd", position: "relative", cursor: "pointer", flexShrink: 0 }}>
                      <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button onClick={e => { e.stopPropagation(); removeModelImage(i); }} style={{ position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    </div>
                  ))}
                  <div onClick={() => modelFileRef.current?.click()} style={{ width: 50, height: 65, borderRadius: 4, border: "2px dashed #ccc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fff", color: "#bbb", fontSize: 9, flexShrink: 0 }}>
                    <span style={{ fontSize: 18 }}>+</span><span>范文</span>
                  </div>
                  <input ref={modelFileRef} type="file" accept="image/*" multiple onChange={onPickModelImages} style={{ display: "none" }} />
                </div>
                {modelImageUrls.length > 0 && <p style={{ fontSize: 11, color: "#999", marginTop: 4 }}>已添加 {modelImageUrls.length} 张范文，批改时自动对比</p>}
                {modelText && <p style={{ fontSize: 11, color: GREEN, marginTop: 2 }}>✅ 范文已分析（复用中）</p>}
              </div>

              {/* Action buttons */}
              {activeStudent && <button disabled={(activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading} onClick={runGrading} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, color: "#fff", cursor: (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading ? "not-allowed" : "pointer", background: (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading ? "#ccc" : PRIMARY, marginBottom: 8 }}>{loading ? stepText : "批改 " + activeStudent.name + "（" + (activeStudent.images.length || activeStudent.imageUrls.length) + " 张）"}</button>}
              <button disabled={loading} onClick={runBatchGrading} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid " + PRIMARY, fontSize: 13, fontWeight: 600, color: PRIMARY, cursor: loading ? "not-allowed" : "pointer", background: "#fff" }}>🚀 一键批改全部待批改学生</button>
              {loading && <div style={{ marginTop: 10 }}><div style={{ width: "100%", height: 5, borderRadius: 3, background: "#eee" }}><div style={{ width: progress + "%", height: "100%", borderRadius: 3, background: PRIMARY, transition: "width 0.5s" }} /></div><p style={{ fontSize: 11, color: "#888", textAlign: "center", marginTop: 4 }}>{progress}% · {stepText}</p></div>}
            </div>
          </div>
        )}

        {tab === "detail" && <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>{students.filter(s => s.status === "done").map(s => (<button key={s.id} onClick={() => { setActiveStudentId(s.id); setPageIndex(0); }} style={{ padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer", background: activeStudentId === s.id ? PRIMARY : "#eee", color: activeStudentId === s.id ? "#fff" : "#666", fontWeight: 600, fontSize: 13 }}>{s.name}</button>))}{students.filter(s => s.status === "done").length === 0 && <p style={{ color: "#bbb", fontSize: 14 }}>还没有批改完成的学生</p>}</div>
          {activeStudent?.status === "done" && <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16 }}>
            <div style={{ flex: isMobile ? "auto" : "0 0 56%", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 10px", marginBottom: 4, background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", flexWrap: "wrap" }}>
                {toolDefs.map(t => (<button key={t.k} onClick={() => { setTool(t.k); setTextPos(null); setPendingStamp(null); setMovingIdx(-1); }} title={t.l} style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: tool === t.k && !pendingStamp ? PRIMARY : "transparent", color: tool === t.k && !pendingStamp ? "#fff" : "#555", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.ic}</button>))}
                <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                <button onClick={undo} title="撤销" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16 }}>↩</button>
                <button onClick={redo} title="重做" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16 }}>↪</button>
                <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                {[RED, ORANGE, "#2980b9", GREEN, "#333"].map(c => (<div key={c} onClick={() => setStrokeColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: strokeColor === c ? "3px solid #333" : "2px solid #ddd" }} />))}
                <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} title="自定义颜色" style={{ width: 24, height: 24, border: "none", padding: 0, cursor: "pointer", borderRadius: 4 }} />
                <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                <span style={{ fontSize: 11, color: "#999" }}>{fontSize}px</span>
                <input type="range" min={8} max={48} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: 80, cursor: "pointer" }} title="字号" />
                <div style={{ width: 1, height: 24, background: "#ddd", margin: "0 4px" }} />
                <button onClick={exportPNG} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 12, fontWeight: 600 }}>💾 导出</button>
                <button onClick={copyImageToClipboard} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 12, fontWeight: 600 }} title="复制图片到剪贴板，可粘贴到微信">📋 复制图片</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: 8, background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#999", marginRight: 4 }}>快捷批语：</span>
                {QUICK_STAMPS.map((s, i) => (<button key={i} onClick={() => { setPendingStamp(s); setStrokeColor(s.color); setMovingIdx(-1); }} style={{ padding: "3px 10px", borderRadius: 6, border: pendingStamp?.label === s.label ? "2px solid " + s.color : "1px solid #ddd", background: pendingStamp?.label === s.label ? s.color + "18" : "#fafafa", color: s.color, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{s.label}</button>))}
                {pendingStamp && <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>← 点击图片放置</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", marginBottom: 4, background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#999", marginRight: 4 }}>画布：</span>
                <button onClick={() => setPad(0, v => v + 120)} style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 11, color: "#888" }}>+上</button>
                {padTop > 0 && <button onClick={() => setPad(0, v => Math.max(0, v - 120))} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #f0c0c0", background: "#fef2f2", cursor: "pointer", fontSize: 11, color: RED }}>−</button>}
                <button onClick={() => setPad(1, v => v + 120)} style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 11, color: "#888" }}>+下</button>
                {padBot > 0 && <button onClick={() => setPad(1, v => Math.max(0, v - 120))} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #f0c0c0", background: "#fef2f2", cursor: "pointer", fontSize: 11, color: RED }}>−</button>}
                <button onClick={() => setPad(2, v => v + 120)} style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 11, color: "#888" }}>+左</button>
                {padLeft > 0 && <button onClick={() => setPad(2, v => Math.max(0, v - 120))} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #f0c0c0", background: "#fef2f2", cursor: "pointer", fontSize: 11, color: RED }}>−</button>}
                <button onClick={() => setPad(3, v => v + 120)} style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: 11, color: "#888" }}>+右</button>
                {padRight > 0 && <button onClick={() => setPad(3, v => Math.max(0, v - 120))} style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid #f0c0c0", background: "#fef2f2", cursor: "pointer", fontSize: 11, color: RED }}>−</button>}
                {(padTop > 0 || padBot > 0 || padLeft > 0 || padRight > 0) && <button onClick={resetPad} style={{ padding: "2px 10px", borderRadius: 4, border: "1px solid #f0c0c0", background: "#fef2f2", cursor: "pointer", fontSize: 11, color: RED }}>重置</button>}
              </div>

              <div id="canvas-wrap" style={{ position: "relative", maxHeight: "calc(100vh - 320px)", overflow: "auto", background: "#eee", borderRadius: 10, border: "1px solid #eee" }} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
                {activeStudent.imageUrls[pageIndex] && <div style={{ position: "relative", background: "#fff", display: "inline-block", minWidth: "100%" }}>
                  {padTop > 0 && <div style={{ height: padTop, background: "#fff" }} />}
                  <div style={{ display: "flex" }}>
                    {padLeft > 0 && <div style={{ width: padLeft, flexShrink: 0, background: "#fff" }} />}
                    <img ref={imgRef} src={activeStudent.imageUrls[pageIndex]} alt="" style={{ maxWidth: 700, width: "auto", display: "block" }} onLoad={syncCanvas} onDragStart={e => e.preventDefault()} />
                    {padRight > 0 && <div style={{ width: padRight, flexShrink: 0, background: "#fff" }} />}
                  </div>
                  {padBot > 0 && <div style={{ height: padBot, background: "#fff" }} />}
                  <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, cursor: movingIdx >= 0 ? "grabbing" : pendingStamp ? "copy" : tool === "hand" ? (handDragging ? "grabbing" : "grab") : tool === "text" ? "text" : tool === "eraser" ? "pointer" : tool === "penEraser" ? "crosshair" : "crosshair" }} onMouseDown={mDown} onMouseMove={mMove} onMouseUp={mUp} onDoubleClick={mDblClick} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); redraw(); } if (handDragging) setHandDragging(false); setHoverIdx(-1); }} />
                  {movingIdx >= 0 && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(44,62,107,0.9)", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, zIndex: 30, pointerEvents: "none" }}>移动中 · 单击放置 · Esc取消</div>}
                  {textPos && <textarea ref={txtRef} value={textVal} onChange={e => setTextVal(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { setTextPos(null); setTextVal(""); setEditIdx(-1); } }} onBlur={() => setTimeout(() => commitText(), 80)} onContextMenu={e => e.stopPropagation()} style={{ position: "absolute", left: textPos.x, top: textPos.y - 4, fontSize, fontWeight: "bold", color: strokeColor, background: "rgba(255,255,255,0.92)", border: "2px solid " + strokeColor, borderRadius: 4, padding: "2px 6px", outline: "none", zIndex: 10, width: textBoxW, minWidth: 80, minHeight: fontSize * 1.4 + 12, lineHeight: 1.4, fontFamily: "'Noto Sans SC','Microsoft YaHei',sans-serif", resize: "both", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-all", boxSizing: "border-box" }} />}
                </div>}
              </div>
              {activeStudent.imageUrls.length > 1 && <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "8px 0" }}><button disabled={pageIndex <= 0} onClick={() => setPageIndex(i => i - 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 13 }}>← 上一页</button><span style={{ fontSize: 13, color: "#666" }}>{"第 " + (pageIndex + 1) + " / " + activeStudent.imageUrls.length + " 页"}</span><button disabled={pageIndex >= activeStudent.imageUrls.length - 1} onClick={() => setPageIndex(i => i + 1)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #ddd", cursor: "pointer", background: "#fff", fontSize: 13 }}>下一页 →</button></div>}
              <p style={{ fontSize: 11, color: "#bbb", textAlign: "center", margin: "4px 0 0" }}>💡 快捷键 1-7 切换工具 · 双击文字编辑 · 靠近批注显示✥移动按钮 · Esc取消</p>
            </div>

            <div style={{ flex: isMobile ? "auto" : "0 0 42%", overflow: "auto", maxHeight: isMobile ? "none" : "calc(100vh - 180px)" }}>
              {activeStudent.essayDetail ? <>
                <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}><button onClick={copyAllDetail} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid " + PRIMARY, background: "transparent", color: PRIMARY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>📋 复制全部</button><button onClick={generateParentNotice} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid " + GREEN, background: "transparent", color: GREEN, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>📱 家长通知</button></div>
                <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: RED }}>✏️ 逐段批注</h3>{(activeStudent.essayDetail.corrections || []).map((c: any, i: number) => (<div key={i} style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #eee" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}><div style={{ flex: 1 }}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: c.type === "praise" ? GREEN : RED, color: "#fff" }}>{c.paragraph}{c.type === "praise" ? " 👍" : ""}</span><p style={{ fontSize: 13, margin: "4px 0 0", color: "#444" }}>{c.text}</p></div><button onClick={() => copyOneCorrection(c)} style={cpBtnS} title="复制批注">📋</button></div>{c.suggested && c.type !== "praise" && <div style={{ marginTop: 4, padding: "4px 10px", borderRadius: 5, background: "#edf9f1", borderLeft: "3px solid " + GREEN, fontSize: 13, color: GREEN, display: "flex", justifyContent: "space-between", alignItems: "center" }}>→ {c.suggested}<button onClick={() => copyOneSuggested(c)} style={{ ...cpBtnS, color: GREEN }} title="复制建议">📋</button></div>}</div>))}</div>
                {activeStudent.essayDetail.good_phrases?.length > 0 && <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: RED }}>⭕ 好词好句</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{activeStudent.essayDetail.good_phrases.map((g: any, i: number) => (<span key={i} style={{ padding: "4px 12px", borderRadius: 20, background: g.type === "word" ? "#fef2f2" : "#fff8ed", border: "1px solid " + (g.type === "word" ? "#f0c0c0" : "#f0e0c0"), fontSize: 13, color: "#555" }}>{g.type === "word" ? "📍" : "〰️"} {g.phrase} <span style={{ fontSize: 11, color: "#999" }}>{g.paragraph}</span></span>))}</div></div>}
                <div style={{ marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3 style={{ fontSize: 16, fontWeight: 700, color: GREEN, margin: 0 }}>🌟 三大亮点</h3><button onClick={copyAllHighlights} style={cpBtnS}>📋</button></div>{(activeStudent.essayDetail.highlights || []).map((h: any, i: number) => (<div key={i} style={{ background: "#edf9f1", borderRadius: 8, padding: 14, marginBottom: 8, borderLeft: "3px solid " + GREEN }}><p style={{ fontWeight: 700, fontSize: 14, color: GREEN, marginBottom: 4 }}>{(i + 1) + ". " + h.title}</p><p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#444" }}>{h.description}</p></div>))}</div>
                {activeStudent.essayDetail.dimensions && <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>📊 四维评价</h3>{Object.entries(activeStudent.essayDetail.dimensions as Record<string, string>).map(([key, val]) => { const lb: Record<string, string> = { content: "内容", structure: "结构", language: "语言", writing: "书写" }; return (<div key={key} style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #eee" }}><p style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: PRIMARY }}>{lb[key] || key}</p><p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: "#555" }}>{val}</p></div>); })}</div>}
                {activeStudent.essayDetail.special_req_feedback && <div style={{ background: "#fff0f6", borderRadius: 8, padding: 16, border: "1px solid #f0c0d8", marginBottom: 16 }}><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#c0392b" }}>📝 本次特殊要求反馈</h3><p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#555" }}>{activeStudent.essayDetail.special_req_feedback}</p></div>}
                {activeStudent.essayDetail.model_comparison && <div style={{ background: "#f0f8ff", borderRadius: 8, padding: 16, border: "1px solid #b8d8f0", marginBottom: 16 }}><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#2980b9" }}>📄 范文对比分析</h3><p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#555", whiteSpace: "pre-wrap" }}>{activeStudent.essayDetail.model_comparison}</p></div>}
                {activeStudent.essayDetail.teacher_comment && <div style={{ background: "#fff8ed", borderRadius: 8, padding: 16, border: "1px solid #f0e0c0", marginBottom: 16, position: "relative" }}><button onClick={copyTeacherComment} style={{ ...cpBtnS, position: "absolute", top: 12, right: 12 }}>📋</button><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>💬 教师总评</h3><p style={{ fontSize: 14, lineHeight: 2, margin: 0, color: "#555" }}>{activeStudent.essayDetail.teacher_comment}</p></div>}
                {activeStudent.essayDetail.improvement_tips?.length > 0 && <div style={{ background: "#f0f4ff", borderRadius: 8, padding: 16, border: "1px solid #d0d8f0", position: "relative" }}><button onClick={copyAllTips} style={{ ...cpBtnS, position: "absolute", top: 12, right: 12 }}>📋</button><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: PRIMARY }}>📝 改进方向</h3>{activeStudent.essayDetail.improvement_tips.map((tip: string, i: number) => (<p key={i} style={{ fontSize: 13, lineHeight: 1.8, margin: "0 0 6px", color: "#444" }}>{tip}</p>))}</div>}
              </> : <p style={{ color: "#bbb", textAlign: "center", paddingTop: 40 }}>请先批改后查看</p>}
            </div>
          </div>}
        </div>}

        {/* ========== ARCHIVE TAB ========== */}
        {tab === "archive" && <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#555" }}>📦 储存箱 <span style={{ fontSize: 13, fontWeight: 400, color: "#999" }}>（已归档的批改记录）</span></h3>
          {students.filter(s => s.archived).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}>
              <p style={{ fontSize: 36 }}>📦</p>
              <p>储存箱是空的</p>
              <p style={{ fontSize: 13 }}>批改完成的学生可以在列表里点 📦 归档到这里</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {students.filter(s => s.archived).map(s => (
                <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #eee", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: s.status === "done" ? GREEN : "#eee", color: s.status === "done" ? "#fff" : "#999" }}>{s.status === "done" ? "已批改" : s.status}</span>
                  </div>
                  {s.essayDetail?.teacher_comment && <p style={{ fontSize: 12, color: "#888", lineHeight: 1.6, margin: 0 }}>{s.essayDetail.teacher_comment.slice(0, 80)}...</p>}
                  <div style={{ fontSize: 12, color: "#aaa" }}>{s.imageUrls.length} 张照片</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button onClick={() => { unarchiveStudent(s.id); setActiveStudentId(s.id); setTab("upload"); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid " + PRIMARY, background: "transparent", color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>↩ 取回</button>
                    <button onClick={() => { unarchiveStudent(s.id); setActiveStudentId(s.id); setTab("detail"); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid #ddd", background: "#fff", color: "#666", fontSize: 12, cursor: "pointer" }}>👁 查看</button>
                    <button onClick={() => { if (confirm("确定永久删除 " + s.name + " 的所有数据？")) removeStudent(s.id); }} style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #f0c0c0", background: "#fef2f2", color: RED, fontSize: 12, cursor: "pointer" }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}