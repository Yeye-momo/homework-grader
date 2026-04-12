"use client";
import { useState, useRef, useEffect, useCallback } from "react";

type TabName = "upload" | "detail" | "archive";
type Tool = "pen" | "text" | "circle" | "wavy" | "eraser" | "hand" | "penEraser";
interface Student { id: string; name: string; className: string; images: File[]; imageUrls: string[]; ocrText: string; essayDetail: any | null; report: string; status: "idle" | "grading" | "done" | "error"; errorMsg?: string; archived?: boolean; history?: { date: string; topic: string; grade: string; essayDetail: any; imageUrls: string[] }[]; }
interface DrawAction { type: "pen" | "text" | "circle" | "wavy"; color: string; lineWidth: number; points?: { x: number; y: number }[]; x?: number; y?: number; w?: number; h?: number; endX?: number; text?: string; fontSize?: number; textAlign?: "left" | "center" | "right" | "justify"; }

interface ToolLink { id: string; name: string; url: string; desc?: string; icon?: string; folder?: string; }

const PRIMARY = "#2D4A3E", PRIMARY_LIGHT = "#E8EEEB", PRIMARY_MID = "#C2D1CA", RED = "#9B4D46", GREEN = "#5A8A6A", ORANGE = "#B8865C", BG = "#FAFAF8";
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const DEFAULT_TOOLBOX: ToolLink[] = [
  { id: "aw_aa", name: "AA教育奖状", url: "https://aakit.cn/jiangzhuang/", desc: "专为班级设计，支持批量生成，免费无需注册", icon: "🏫", folder: "奖状生成" },
  { id: "aw_lddgo", name: "老董奖状生成器", url: "https://www.lddgo.net/image/certificate-generate", desc: "支持自定义模板和背景图片上传", icon: "🎨", folder: "奖状生成" },
  { id: "aw_jiling", name: "记灵工具", url: "https://remeins.com/index/app/award", desc: "全部免费，快速生成专业奖状", icon: "⚡", folder: "奖状生成" },
  { id: "aw_33tool", name: "蜻蜓奖状生成器", url: "https://33tool.com/maker_cert/", desc: "支持批量模式，可直接复制到微信", icon: "🦋", folder: "奖状生成" },
  { id: "aw_canva", name: "Canva可画", url: "https://www.canva.cn/create/awards/", desc: "海量精美模板，拖拽编辑（需注册）", icon: "✨", folder: "奖状生成" },
  { id: "aw_gaoding", name: "稿定设计", url: "https://www.gaoding.com/features/prize-certificate-generator", desc: "专业设计工具，丰富模板", icon: "🎖", folder: "奖状生成" },
  { id: "tb_田字格", name: "田字格字帖生成", url: "https://remeins.com/index/app/tianzige", desc: "在线生成田字格练字帖", icon: "📝", folder: "教学工具" },
  { id: "tb_拼音", name: "汉字注音工具", url: "https://www.lddgo.net/string/pinyin", desc: "汉字自动注拼音", icon: "🔤", folder: "教学工具" },
  { id: "tb_朗读", name: "文字转语音", url: "https://remeins.com/index/app/tts", desc: "课文朗读生成", icon: "🔊", folder: "教学工具" },
  { id: "tb_词典", name: "成语词典", url: "https://www.zdic.net/cd/", desc: "在线成语查询", icon: "📖", folder: "教学工具" },
];
const QUICK_STAMPS = [
  { label: "好词✓", color: RED }, { label: "好句✓", color: RED }, { label: "精彩!", color: RED },
  { label: "改", color: RED }, { label: "错字", color: RED }, { label: "?", color: ORANGE },
  { label: "不通顺", color: ORANGE }, { label: "离题", color: ORANGE }, { label: "加标点", color: ORANGE }, { label: "标点符号", color: ORANGE },
  { label: "分段", color: "#2980b9" },
];

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
function saveOneImage(studentId: string, pageIdx: number, dataUrl: string): Promise<void> {
  return new Promise(async (resolve) => {
    try { const db = await openImgDB(); const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(dataUrl, studentId + "_img_" + pageIdx); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); resolve(); }; } catch { resolve(); }
  });
}
function saveModelImage(idx: number, dataUrl: string): Promise<void> {
  return new Promise(async (resolve) => {
    try { const db = await openImgDB(); const tx = db.transaction(DB_STORE, "readwrite"); tx.objectStore(DB_STORE).put(dataUrl, "model_essay_img_" + idx); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); resolve(); }; } catch { resolve(); }
  });
}
async function loadModelImages(count: number): Promise<string[]> {
  try { const db = await openImgDB(); const r: string[] = []; for (let i = 0; i < count; i++) { const url = await new Promise<string>((res) => { const tx = db.transaction(DB_STORE, "readonly"); const rq = tx.objectStore(DB_STORE).get("model_essay_img_" + i); rq.onsuccess = () => res(rq.result || ""); rq.onerror = () => res(""); }); if (url) r.push(url); } db.close(); return r; } catch { return []; }
}
async function clearModelImages(count: number) {
  try { const db = await openImgDB(); const tx = db.transaction(DB_STORE, "readwrite"); for (let i = 0; i < count; i++) tx.objectStore(DB_STORE).delete("model_essay_img_" + i); tx.oncomplete = () => db.close(); } catch {}
}
async function loadStudentImages(studentId: string, count: number): Promise<string[]> {
  try { const db = await openImgDB(); const r: string[] = []; for (let i = 0; i < count; i++) { const url = await new Promise<string>((res) => { const tx = db.transaction(DB_STORE, "readonly"); const rq = tx.objectStore(DB_STORE).get(studentId + "_img_" + i); rq.onsuccess = () => res(rq.result || ""); rq.onerror = () => res(""); }); if (url) r.push(url); } db.close(); return r; } catch { return []; }
}
async function deleteStudentImages(studentId: string, count: number) {
  try { const db = await openImgDB(); const tx = db.transaction(DB_STORE, "readwrite"); for (let i = 0; i < count; i++) tx.objectStore(DB_STORE).delete(studentId + "_img_" + i); tx.oncomplete = () => db.close(); } catch {}
}

export default function Home() {
  const [tab, setTab] = useState<TabName>("upload");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => { const check = () => setIsMobile(window.innerWidth < 768); check(); window.addEventListener("resize", check); return () => window.removeEventListener("resize", check); }, []);
  const [students, setStudents] = useState<Student[]>([]);
  const [activeStudentId, setActiveStudentId] = useState("");
  const [grade, setGrade] = useState("三年级下");
  const [topic, setTopic] = useState("想象作文");
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
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameVal, setEditingNameVal] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState("");
  const [batchStatus, setBatchStatus] = useState("");
  const [splitPct, setSplitPct] = useState(58);
  const splitDragging = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [parentNotice, setParentNotice] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [globalDragOver, setGlobalDragOver] = useState(false);
  const globalDragCounter = useRef(0);
  const [tool, setTool] = useState<Tool>("pen");
  const [strokeColor, setStrokeColor] = useState(RED);
  const [penWidth] = useState(2);
  const [fontSize, setFontSize] = useState(14);
  const [textAlign, setTextAlign] = useState<"left" | "center" | "right" | "justify">("justify");
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
  const [padMap, setPadMap] = useState<Record<string, [number, number, number, number]>>({});
  const [classNames, setClassNames] = useState<string[]>(["默认班"]);
  const [currentClass, setCurrentClass] = useState("默认班");
  const [newClassName, setNewClassName] = useState("");
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");
  const [customEpPro, setCustomEpPro] = useState("");
  const [customEpFast, setCustomEpFast] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAward, setShowAward] = useState(false);
  const [showToolbox, setShowToolbox] = useState(false);
  const [toolboxItems, setToolboxItems] = useState<ToolLink[]>(DEFAULT_TOOLBOX);
  const [tbAddName, setTbAddName] = useState("");
  const [tbAddUrl, setTbAddUrl] = useState("");
  const [tbAddDesc, setTbAddDesc] = useState("");
  const [tbAddIcon, setTbAddIcon] = useState("🔗");
  const [tbAddFolder, setTbAddFolder] = useState("");
  const [tbEditing, setTbEditing] = useState(false);
  const [tbCollapsed, setTbCollapsed] = useState<Set<string>>(new Set());
  const [tbNewFolder, setTbNewFolder] = useState("");
  const [tbDragId, setTbDragId] = useState<string | null>(null);
  const [archiveHistOpen, setArchiveHistOpen] = useState(false);
  const [expandedArchiveId, setExpandedArchiveId] = useState<string | null>(null);
  const [archiveDetailId, setArchiveDetailId] = useState<string | null>(null);

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const txtRef = useRef<HTMLTextAreaElement>(null);
  const hoverLockRef = useRef(false);
  const textClickTimer = useRef<any>(null);

  const activeStudent = students.find((s) => s.id === activeStudentId) || null;
  const pk = activeStudentId + "_" + pageIndex;
  const pad = padMap[pk] || [0, 0, 0, 0];
  const [padTop, padBot, padLeft, padRight] = pad;
  const classStudents = students.filter(s => !s.archived && s.className === currentClass && (!searchQuery || s.name.includes(searchQuery)));

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
  function setPadFn(idx: number, fn: (v: number) => number) {
    const cur = padMap[pk] || [0,0,0,0]; const oldVal = cur[idx]; const newVal = fn(oldVal); const diff = newVal - oldVal; if (diff === 0) return;
    const dx = idx === 2 ? diff : 0; const dy = idx === 0 ? diff : 0; shiftAnnotations(dx, dy);
    setPadMap(prev => { const next = [...(prev[pk] || [0,0,0,0])] as [number,number,number,number]; next[idx] = newVal; return { ...prev, [pk]: next }; });
  }
  function setPadVal(idx: number, newVal: number) { setPadFn(idx, () => newVal); }
  function resetPad() { const cur = padMap[pk] || [0,0,0,0]; shiftAnnotations(-cur[2], -cur[0]); setPadMap(prev => ({ ...prev, [pk]: [0,0,0,0] })); }

  const [initDone, setInitDone] = useState(false);
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem("hw_grader_v8") || "{}");
      if (d.students) {
        const loaded = d.students.map((s: any) => ({ ...s, images: [], imageUrls: [], className: s.className || "默认班", _savedImgCount: s.imageCount || 0 }));
        setStudents(loaded);
        setActiveStudentId(d.activeStudentId || "");
        if (d.grade) setGrade(d.grade);
        if (d.topic) setTopic(d.topic);
        if (d.specialReq) setSpecialReq(d.specialReq);
        if (d.modelText) setModelText(d.modelText);
        if (d.classNames?.length) setClassNames(d.classNames);
        if (d.currentClass) setCurrentClass(d.currentClass);
        if (d.tab) setTab(d.tab);
        const apiSettings = JSON.parse(localStorage.getItem("hw_api_settings") || "{}");
        if (apiSettings.apiKey) setCustomApiKey(apiSettings.apiKey);
        if (apiSettings.epPro) setCustomEpPro(apiSettings.epPro);
        if (apiSettings.epFast) setCustomEpFast(apiSettings.epFast);
        try { const tb = JSON.parse(localStorage.getItem("hw_toolbox") || "[]"); if (tb.length > 0) setToolboxItems(tb); } catch {}
        let pending = 0;
        loaded.forEach((s: any) => {
          const imgCount = s._savedImgCount || 0;
          if (imgCount > 0) {
            pending++;
            loadStudentImages(s.id, imgCount).then(urls => {
              const valid = urls.filter(u => u);
              if (valid.length > 0) setStudents(prev => prev.map(st => st.id === s.id ? { ...st, imageUrls: valid } : st));
              pending--;
              if (pending <= 0) setInitDone(true);
            });
          }
        });
        if (pending === 0) setInitDone(true);
        const modelImgCount = d.modelImageCount || 0;
        if (modelImgCount > 0) loadModelImages(modelImgCount).then(urls => { const v = urls.filter(u => u); if (v.length > 0) setModelImageUrls(v); });
      } else {
        setInitDone(true);
      }
      if (d.actionMap) setActionMap(d.actionMap);
      if (d.padMap) setPadMap(d.padMap);
    } catch { setInitDone(true); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!initDone) return;
    try {
      const data = {
        students: students.map(s => ({ ...s, images: [], imageUrls: [], imageCount: s.imageUrls.length })),
        activeStudentId, grade, topic, actionMap, padMap, specialReq, modelText,
        modelImageCount: modelImageUrls.length, classNames, currentClass, tab,
      };
      localStorage.setItem("hw_grader_v8", JSON.stringify(data));
    } catch {}
  }, [students, activeStudentId, grade, topic, actionMap, padMap, specialReq, modelText, modelImageUrls, classNames, currentClass, tab, initDone]);
  useEffect(() => { if (initDone) { try { localStorage.setItem("hw_toolbox", JSON.stringify(toolboxItems)); } catch {} } }, [toolboxItems, initDone]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!splitDragging.current || !splitContainerRef.current) return;
      e.preventDefault();
      const rect = splitContainerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(30, pct)));
    };
    const onUp = () => { splitDragging.current = false; document.body.style.cursor = ""; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    const out: string[] = [];
    for (const raw of text.split("\n")) { if (!raw) { out.push(""); continue; } let cur = ""; for (const ch of raw) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; } if (cur) out.push(cur); }
    return out;
  }

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
        const textH = lines.length * fs * 1.4; let maxLineW = 0; for (const l of lines) maxLineW = Math.max(maxLineW, ctx.measureText(l).width);
        const boxW = a.w || maxLineW;
        ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fillRect(a.x - 2, a.y - 1, boxW + 4, textH + 2);
        ctx.fillStyle = a.color;
        const align = a.textAlign || "justify";
        for (let li = 0; li < lines.length; li++) {
          const lw = ctx.measureText(lines[li]).width;
          const dx = align === "center" ? (boxW - lw) / 2 : align === "right" ? boxW - lw : 0;
          ctx.fillText(lines[li], a.x + dx, a.y + li * (fs * 1.4));
        }
      }
      else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { ctx.beginPath(); let wx = Math.min(a.x, a.endX); const mx = Math.max(a.x, a.endX); ctx.moveTo(wx, a.y); while (wx < mx) { ctx.quadraticCurveTo(wx + 4, a.y - 5, wx + 8, a.y); ctx.quadraticCurveTo(wx + 12, a.y + 5, wx + 16, a.y); wx += 16; } ctx.stroke(); }
    }
    if (hoverIdx >= 0 && movingIdx < 0 && !textPos && tool !== "hand") {
      const ha = acts[hoverIdx]; if (ha) { const b = getActionBounds(ha); if (b) {
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = "rgba(44,62,107,0.4)"; ctx.lineWidth = 1;
        ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.setLineDash([]);
        const bx = b.x + b.w + 6, by = b.y - 4;
        ctx.fillStyle = "rgba(44,62,107,0.85)"; ctx.beginPath();
        const r = 4; const bw2 = 26, bh2 = 24;
        ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw2 - r, by); ctx.arcTo(bx + bw2, by, bx + bw2, by + r, r); ctx.lineTo(bx + bw2, by + bh2 - r); ctx.arcTo(bx + bw2, by + bh2, bx + bw2 - r, by + bh2, r); ctx.lineTo(bx + r, by + bh2); ctx.arcTo(bx, by + bh2, bx, by + bh2 - r, r); ctx.lineTo(bx, by + r); ctx.arcTo(bx, by, bx + r, by, r);
        ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "bold 14px sans-serif"; ctx.textBaseline = "middle"; ctx.fillText("✥", bx + 5, by + bh2 / 2); ctx.restore();
      }}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionMap, pk, editIdx, textPos, hoverIdx, movingIdx, tool]);

  useEffect(() => { redraw(); }, [redraw]);

  function syncCanvas() {
    const cv = canvasRef.current, img = imgRef.current; if (!cv || !img) return;
    const dpr = window.devicePixelRatio || 1;
    const w = img.offsetWidth + padLeft + padRight, h = img.offsetHeight + padTop + padBot;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
    redraw();
  }
  function gp(e: React.MouseEvent<HTMLCanvasElement>) { const r = canvasRef.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function pushAct(a: DrawAction) { const acts = [...(actionMap[pk] || []), a]; setActionMap(pr => ({ ...pr, [pk]: acts })); const h = histMap[pk] || [actionMap[pk] || []]; const hi = histIdx[pk] ?? 0; const nh = [...h.slice(0, hi + 1), acts]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function replaceAct(i: number, a: DrawAction) { const acts = [...(actionMap[pk] || [])]; acts[i] = a; setActionMap(pr => ({ ...pr, [pk]: acts })); const h = histMap[pk] || [actionMap[pk] || []]; const hi = histIdx[pk] ?? 0; const nh = [...h.slice(0, hi + 1), acts]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function deleteAct(idx: number) { const acts = (actionMap[pk] || []).filter((_, i) => i !== idx); setActionMap(pr => ({ ...pr, [pk]: acts })); const h = histMap[pk] || [actionMap[pk] || []]; const hi = histIdx[pk] ?? 0; const nh = [...h.slice(0, hi + 1), acts]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function saveToHistory() { const acts = actionMap[pk] || []; const h = histMap[pk] || []; const idx = histIdx[pk] ?? 0; const nh = [...h.slice(0, idx + 1), [...acts]]; setHistMap(pr => ({ ...pr, [pk]: nh })); setHistIdx(pr => ({ ...pr, [pk]: nh.length - 1 })); }
  function undo() { const h = histMap[pk], i = histIdx[pk] ?? 0; if (!h || i <= 0) return; setHistIdx(p => ({ ...p, [pk]: i - 1 })); setActionMap(p => ({ ...p, [pk]: h[i - 1] })); }
  function redo() { const h = histMap[pk], i = histIdx[pk] ?? 0; if (!h || i >= h.length - 1) return; setHistIdx(p => ({ ...p, [pk]: i + 1 })); setActionMap(p => ({ ...p, [pk]: h[i + 1] })); }

  function getActionBounds(a: DrawAction) {
    const cv = canvasRef.current; const ctx = cv?.getContext("2d");
    if (a.type === "text" && a.x != null && a.y != null) {
      const fs = a.fontSize || 18; let tw = 60, th = fs * 1.4;
      if (ctx) { ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; const dpr = window.devicePixelRatio || 1; const cssW = cv ? cv.width / dpr : 700; const mw = a.w || (cssW - a.x - 10); const wrapped = wrapText(ctx, a.text || "", mw > 20 ? mw : 200); tw = a.w || Math.max(...wrapped.map(l => ctx.measureText(l).width), 30); th = wrapped.length * fs * 1.4; }
      return { x: a.x, y: a.y, w: tw, h: th };
    }
    if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) return { x: a.x, y: a.y, w: a.w, h: a.h };
    if (a.type === "pen" && a.points && a.points.length > 0) { let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; for (const p of a.points) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); } return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
    if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { const mn = Math.min(a.x, a.endX); return { x: mn, y: a.y - 8, w: Math.abs(a.endX - a.x), h: 16 }; }
    return null;
  }
  function isOnMoveBtn(px: number, py: number): number {
    const acts = actionMap[pk] || [];
    for (let i = acts.length - 1; i >= 0; i--) { const b = getActionBounds(acts[i]); if (b) { const bx = b.x + b.w + 6, by = b.y - 4; if (px >= bx && px <= bx + 26 && py >= by && py <= by + 24) return i; } }
    return -1;
  }

  function mDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return; const p = gp(e);
    if (movingIdx >= 0) { saveToHistory(); setMovingIdx(-1); return; }
    if (hoverIdx >= 0 && movingIdx < 0) { const btnHit = isOnMoveBtn(p.x, p.y); if (btnHit >= 0) { const a = (actionMap[pk] || [])[btnHit]; if (!a) return; const b = getActionBounds(a); if (!b) return; setMovingIdx(btnHit); setMovingOffset({ x: p.x - b.x, y: p.y - b.y }); return; } }
    if (pendingStamp) { pushAct({ type: "text", color: pendingStamp.color, lineWidth: penWidth, x: p.x, y: p.y, text: pendingStamp.label, fontSize }); setPendingStamp(null); return; }
    if (tool === "hand") { const wrap = document.getElementById("canvas-wrap"); if (wrap) { setHandDragging(true); setHandStart({ x: e.clientX, y: e.clientY, scrollX: wrap.scrollLeft, scrollY: wrap.scrollTop }); } return; }
    if (tool === "pen") { setIsDrawing(true); setCurPoints([p]); }
    else if (tool === "circle" || tool === "wavy") { setIsDrawing(true); setDrawStart(p); }
    else if (tool === "text") {
      if (textClickTimer.current) clearTimeout(textClickTimer.current);
      if (textPos) { commitText(); setTool("pen"); return; }
      const clickP = { ...p };
      textClickTimer.current = setTimeout(() => { setEditIdx(-1); setTextPos({ x: clickP.x, y: clickP.y }); setTextVal(""); setTextBoxW(220); setTimeout(() => txtRef.current?.focus(), 30); }, 250);
    }
    else if (tool === "eraser") { const acts = actionMap[pk] || []; const hi = hitTest(acts, p.x, p.y); if (hi >= 0) deleteAct(hi); }
    else if (tool === "penEraser") { setIsDrawing(true); erasePenAt(p.x, p.y); }
  }
  function mDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    if (textClickTimer.current) { clearTimeout(textClickTimer.current); textClickTimer.current = null; }
    const p = gp(e); const acts = actionMap[pk] || [];
    const hi = hitTestText(acts, p.x, p.y);
    if (hi >= 0) { const a = acts[hi]; setEditIdx(hi); setTextPos({ x: a.x!, y: a.y! }); setTextVal(a.text || ""); setStrokeColor(a.color); setFontSize(a.fontSize || 18); setTextAlign(a.textAlign || "justify"); setTextBoxW(a.w ? a.w + 16 : 220); setTool("text"); setTimeout(() => txtRef.current?.focus(), 30); }
  }
  function mMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = gp(e); setMousePos(p);
    if (handDragging) { const wrap = document.getElementById("canvas-wrap"); if (wrap) { wrap.scrollLeft = handStart.scrollX - (e.clientX - handStart.x); wrap.scrollTop = handStart.scrollY - (e.clientY - handStart.y); } return; }
    if (movingIdx >= 0) {
      const acts = [...(actionMap[pk] || [])]; const a = { ...acts[movingIdx] }; const dx = p.x - movingOffset.x, dy = p.y - movingOffset.y;
      if (a.type === "pen" && a.points) { const o = acts[movingIdx].points![0]; a.points = a.points.map(pt => ({ x: pt.x + (dx - o.x), y: pt.y + (dy - o.y) })); }
      else if (a.type === "circle" || a.type === "text") { a.x = dx; a.y = dy; }
      else if (a.type === "wavy") { const w = (a.endX || 0) - (a.x || 0); a.x = dx; a.y = dy; a.endX = dx + w; }
      acts[movingIdx] = a; setActionMap(pr => ({ ...pr, [pk]: acts })); return;
    }
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
    if (handDragging) { setHandDragging(false); return; } if (movingIdx >= 0) return; if (!isDrawing) return; setIsDrawing(false); const p = gp(e);
    if (tool === "pen" && curPoints.length > 1) { pushAct({ type: "pen", color: strokeColor, lineWidth: penWidth, points: [...curPoints, p] }); setCurPoints([]); }
    else if (tool === "circle") { const w = p.x - drawStart.x, h = p.y - drawStart.y; if (Math.abs(w) > 5 && Math.abs(h) > 5) pushAct({ type: "circle", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, w, h }); }
    else if (tool === "wavy") { if (Math.abs(p.x - drawStart.x) > 10) pushAct({ type: "wavy", color: strokeColor, lineWidth: penWidth, x: drawStart.x, y: drawStart.y, endX: p.x }); }
    else if (tool === "penEraser") { saveToHistory(); }
  }
  function commitText() {
    if (textVal.trim() && textPos) { const ta = txtRef.current; const bw = ta ? ta.offsetWidth - 16 : undefined; const act: DrawAction = { type: "text", color: strokeColor, lineWidth: penWidth, x: textPos.x, y: textPos.y, text: textVal, fontSize, w: bw, textAlign }; if (editIdx >= 0) replaceAct(editIdx, act); else pushAct(act); }
    else if (editIdx >= 0 && !textVal.trim()) deleteAct(editIdx);
    setTextPos(null); setTextVal(""); setEditIdx(-1);
  }
  function erasePenAt(cx: number, cy: number) { const R = 10; const acts = actionMap[pk] || []; const newActs = [...acts]; let changed = false; for (let i = newActs.length - 1; i >= 0; i--) { const a = newActs[i]; if (a.type === "pen" && a.points) { const remaining = a.points.filter(p => Math.abs(p.x - cx) > R || Math.abs(p.y - cy) > R); if (remaining.length !== a.points.length) { changed = true; if (remaining.length < 2) newActs.splice(i, 1); else newActs[i] = { ...a, points: remaining }; } } } if (changed) setActionMap(pr => ({ ...pr, [pk]: newActs })); }
  function hitTest(acts: DrawAction[], cx: number, cy: number) { const R = 20; const cv = canvasRef.current; const ctx = cv?.getContext("2d"); for (let i = acts.length - 1; i >= 0; i--) { const a = acts[i]; if (a.type === "pen" && a.points) { for (const p of a.points) if (Math.abs(p.x - cx) < R && Math.abs(p.y - cy) < R) return i; } else if (a.type === "circle" && a.x != null && a.w != null && a.y != null && a.h != null) { if (Math.abs(a.x + a.w / 2 - cx) < Math.abs(a.w) / 2 + R && Math.abs(a.y + a.h / 2 - cy) < Math.abs(a.h) / 2 + R) return i; } else if (a.type === "text" && a.x != null && a.y != null) { const fs = a.fontSize || 18; const lines = (a.text || "").split("\n"); let tw = a.w || 60; if (ctx) { ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; tw = a.w || Math.max(...lines.map(l => ctx.measureText(l).width), 30); } if (cx > a.x - R && cx < a.x + tw + R && cy > a.y - 10 && cy < a.y + lines.length * fs * 1.4 + 10) return i; } else if (a.type === "wavy" && a.x != null && a.endX != null && a.y != null) { if (cx > Math.min(a.x, a.endX) - R && cx < Math.max(a.x, a.endX) + R && Math.abs(cy - a.y) < R) return i; } } return -1; }
  function hitTestText(acts: DrawAction[], cx: number, cy: number) { for (let i = acts.length - 1; i >= 0; i--) { const a = acts[i]; if (a.type === "text" && a.x != null && a.y != null) { const b = getActionBounds(a); if (b && cx > b.x - 10 && cx < b.x + b.w + 10 && cy > b.y - 10 && cy < b.y + b.h + 10) return i; } } return -1; }

  function exportOnePNG(studentId: string, pIdx: number): Promise<Blob | null> {
    return new Promise((resolve) => {
      const stu = students.find(s => s.id === studentId); if (!stu || !stu.imageUrls[pIdx]) { resolve(null); return; }
      const pPad = padMap[studentId + "_" + pIdx] || [0,0,0,0]; const acts = actionMap[studentId + "_" + pIdx] || [];
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        const cv = canvasRef.current; const displayImgW = cv ? parseFloat(cv.style.width) - pPad[2] - pPad[3] : img.naturalWidth;
        const scale = img.naturalWidth / (displayImgW || img.naturalWidth);
        let contentRight = img.naturalWidth + pPad[2] * scale, contentBottom = img.naturalHeight + pPad[0] * scale;
        for (const a of acts) { const b = getActionBounds(a); if (b) { contentRight = Math.max(contentRight, (b.x + b.w) * scale + 10); contentBottom = Math.max(contentBottom, (b.y + b.h) * scale + 10); } }
        const totalW = Math.max(contentRight, img.naturalWidth), totalH = Math.max(contentBottom, img.naturalHeight + pPad[0] * scale);
        const m = document.createElement("canvas"); m.width = totalW; m.height = totalH;
        const ctx = m.getContext("2d"); if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, totalW, totalH); ctx.drawImage(img, pPad[2] * scale, pPad[0] * scale);
        for (const a of acts) {
          ctx.strokeStyle = a.color; ctx.fillStyle = a.color; ctx.lineWidth = a.lineWidth * scale; ctx.lineCap = "round"; ctx.lineJoin = "round";
          if (a.type === "pen" && a.points && a.points.length > 1) { ctx.beginPath(); ctx.moveTo(a.points[0].x * scale, a.points[0].y * scale); for (let i = 1; i < a.points.length; i++) ctx.lineTo(a.points[i].x * scale, a.points[i].y * scale); ctx.stroke(); }
          else if (a.type === "circle" && a.x != null && a.y != null && a.w != null && a.h != null) { const rx = Math.abs(a.w * scale) / 2, ry = Math.abs(a.h * scale) / 2; if (rx > 0 && ry > 0) { ctx.beginPath(); ctx.ellipse((a.x + a.w / 2) * scale, (a.y + a.h / 2) * scale, rx, ry, 0, 0, Math.PI * 2); ctx.stroke(); } }
          else if (a.type === "text" && a.x != null && a.y != null && a.text) { const fs = (a.fontSize || 18) * scale; ctx.font = `bold ${fs}px 'Noto Sans SC','Microsoft YaHei',sans-serif`; ctx.textBaseline = "top"; const mw = a.w ? a.w * scale : (totalW - a.x * scale - 10); const lines = wrapText(ctx, a.text, mw > 20 ? mw : 200); const textH = lines.length * fs * 1.4; let maxLW = 0; for (const l of lines) maxLW = Math.max(maxLW, ctx.measureText(l).width); const boxW = a.w ? a.w * scale : maxLW; ctx.fillStyle = "rgba(255,255,255,0.82)"; ctx.fillRect(a.x * scale - 2, a.y * scale - 1, boxW + 4, textH + 2); ctx.fillStyle = a.color; const align = a.textAlign || "justify"; for (let li = 0; li < lines.length; li++) { const lw = ctx.measureText(lines[li]).width; const dx = align === "center" ? (boxW - lw) / 2 : align === "right" ? boxW - lw : 0; ctx.fillText(lines[li], a.x * scale + dx, a.y * scale + li * (fs * 1.4)); } }
          else if (a.type === "wavy" && a.x != null && a.y != null && a.endX != null) { ctx.beginPath(); let wx = Math.min(a.x, a.endX) * scale; const mx = Math.max(a.x, a.endX) * scale; const wy = a.y * scale; ctx.moveTo(wx, wy); const step = 16 * scale; while (wx < mx) { ctx.quadraticCurveTo(wx + step * 0.25, wy - 5 * scale, wx + step * 0.5, wy); ctx.quadraticCurveTo(wx + step * 0.75, wy + 5 * scale, wx + step, wy); wx += step; } ctx.stroke(); }
        }
        m.toBlob(blob => resolve(blob), "image/png");
      };
      img.onerror = () => resolve(null); img.src = stu.imageUrls[pIdx];
    });
  }
  function exportPNG() { if (!activeStudent) return; exportOnePNG(activeStudentId, pageIndex).then(blob => { if (!blob) return; const link = document.createElement("a"); link.download = "批注_" + activeStudent.name + "_" + (pageIndex + 1) + ".png"; link.href = URL.createObjectURL(blob); link.click(); }); }
  async function copyImageToClipboard() { if (!activeStudent) return; const blob = await exportOnePNG(activeStudentId, pageIndex); if (!blob) { alert("导出失败"); return; } try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); setCopyMsg("已复制图片，可粘贴到微信"); setTimeout(() => setCopyMsg(""), 2000); } catch { alert("复制失败，请使用导出按钮下载后发送"); } }
  async function exportAllPNGs() { const done = students.filter(s => s.status === "done"); if (done.length === 0) { alert("没有已批改的学生"); return; } for (const stu of done) { for (let i = 0; i < stu.imageUrls.length; i++) { const blob = await exportOnePNG(stu.id, i); if (blob) { const link = document.createElement("a"); link.download = stu.name + "_" + (i + 1) + ".png"; link.href = URL.createObjectURL(blob); link.click(); await new Promise(r => setTimeout(r, 300)); } } } }

  function exportData() { const data = { students: students.map(s => ({ ...s, images: [] })), actionMap, padMap, grade, topic, classNames, currentClass, specialReq, modelText, modelImageUrls, version: "v6" }; const blob = new Blob([JSON.stringify(data)], { type: "application/json" }); const link = document.createElement("a"); link.download = "批改数据_" + new Date().toLocaleDateString("zh-CN") + ".json"; link.href = URL.createObjectURL(blob); link.click(); }
  const importFileRef = useRef<HTMLInputElement>(null);
  function importData(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async () => { try { const data = JSON.parse(reader.result as string); if (data.students) { const restored = data.students.map((s: any) => ({ ...s, images: [], className: s.className || "默认班", imageUrls: s.imageUrls || [] })); setStudents(restored); setActiveStudentId(data.students[0]?.id || ""); for (const s of restored) { for (let i = 0; i < s.imageUrls.length; i++) { if (s.imageUrls[i]) await saveOneImage(s.id, i, s.imageUrls[i]); } } } if (data.actionMap) setActionMap(data.actionMap); if (data.padMap) setPadMap(data.padMap); if (data.grade) setGrade(data.grade); if (data.topic) setTopic(data.topic); if (data.classNames) setClassNames(data.classNames); if (data.currentClass) setCurrentClass(data.currentClass); if (data.specialReq) setSpecialReq(data.specialReq); if (data.modelText) setModelText(data.modelText); if (data.modelImageUrls?.length) { setModelImageUrls(data.modelImageUrls); for (let i = 0; i < data.modelImageUrls.length; i++) await saveModelImage(i, data.modelImageUrls[i]); } setCopyMsg("数据导入成功！"); setTimeout(() => setCopyMsg(""), 2000); } catch { alert("数据文件格式错误"); } }; reader.readAsText(file); e.target.value = ""; }

  useEffect(() => { function onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") { if (e.key === "Escape" && textPos) { setTextPos(null); setTextVal(""); setEditIdx(-1); } return; }
    if (e.ctrlKey && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.key === "Escape") { if (movingIdx >= 0) setMovingIdx(-1); if (textPos) { setTextPos(null); setTextVal(""); setEditIdx(-1); } }
    if ((e.key === "Backspace" || e.key === "Delete") && hoverIdx >= 0 && !textPos && movingIdx < 0) { e.preventDefault(); deleteAct(hoverIdx); setHoverIdx(-1); }
    const toolKeys: Record<string, Tool> = { "1": "pen", "2": "hand", "3": "text", "4": "circle", "5": "wavy", "6": "eraser", "7": "penEraser" };
    if (toolKeys[e.key] && !e.ctrlKey && !e.metaKey) { setTool(toolKeys[e.key]); setTextPos(null); setPendingStamp(null); setMovingIdx(-1); }
  } window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); });

  // Global full-screen drag overlay
  useEffect(() => {
    function onDragEnter(e: DragEvent) { e.preventDefault(); globalDragCounter.current++; if (globalDragCounter.current === 1) setGlobalDragOver(true); }
    function onDragLeave(e: DragEvent) { e.preventDefault(); globalDragCounter.current--; if (globalDragCounter.current <= 0) { globalDragCounter.current = 0; setGlobalDragOver(false); } }
    function onDragOver(e: DragEvent) { e.preventDefault(); }
    function onDrop(e: DragEvent) { e.preventDefault(); globalDragCounter.current = 0; setGlobalDragOver(false); }
    window.addEventListener("dragenter", onDragEnter); window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver); window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragenter", onDragEnter); window.removeEventListener("dragleave", onDragLeave); window.removeEventListener("dragover", onDragOver); window.removeEventListener("drop", onDrop); };
  }, []);
  async function onGlobalDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setGlobalDragOver(false); globalDragCounter.current = 0;
    if (!activeStudentId) { alert("请先选择一个学生"); return; }
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const stu = students.find(s => s.id === activeStudentId); const existingCount = stu?.imageUrls.length || 0;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) { const dataUrl = await compressImage(files[i]); dataUrls.push(dataUrl); await saveOneImage(activeStudentId, existingCount + i, dataUrl); }
    setStudents(prev => prev.map(s => s.id !== activeStudentId ? s : { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...dataUrls] }));
    if (tab !== "upload") setTab("upload");
  }

  function addStudent() { if (!newName.trim()) { alert("请输入学生姓名"); return; } const s: Student = { id: uid(), name: newName.trim(), className: currentClass, images: [], imageUrls: [], ocrText: "", essayDetail: null, report: "", status: "idle" }; setStudents(prev => [...prev, s]); setActiveStudentId(s.id); setNewName(""); }
  function removeStudent(id: string) { const stu = students.find(s => s.id === id); deleteStudentImages(id, stu?.imageUrls.length || 10); setStudents(prev => { const next = prev.filter(s => s.id !== id); if (activeStudentId === id) { const fallback = next.find(s => !s.archived && s.className === currentClass); setActiveStudentId(fallback?.id || ""); } return next; }); setLoading(false); setProgress(0); setStepText(""); setBatchStatus(""); }
  function archiveStudent(id: string) { setStudents(prev => { const next = prev.map(s => { if (s.id !== id) return s; const rec = s.status === "done" && s.essayDetail ? { date: new Date().toLocaleDateString("zh-CN"), topic, grade, essayDetail: s.essayDetail, imageUrls: [...s.imageUrls] } : null; const hist = [...(s.history || [])]; if (rec) hist.push(rec); return { ...s, archived: true, history: hist }; }); if (activeStudentId === id) { const fallback = next.find(s => !s.archived && s.className === currentClass && s.id !== id); setActiveStudentId(fallback?.id || ""); } return next; }); }
  function unarchiveStudent(id: string) { setStudents(prev => prev.map(s => s.id === id ? { ...s, archived: false } : s)); }
  function deleteClass(cn: string) { if (cn === "默认班") return; if (!confirm("确定删除班级「" + cn + "」？该班级下的学生将移至默认班。")) return; setStudents(prev => prev.map(s => s.className === cn ? { ...s, className: "默认班" } : s)); setClassNames(prev => prev.filter(c => c !== cn)); if (currentClass === cn) setCurrentClass("默认班"); }

  function compressImage(file: File, maxWidth = 1200, quality = 0.75): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { const canvas = document.createElement("canvas"); let w = img.width, h = img.height; if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; } canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d"); if (!ctx) { resolve(URL.createObjectURL(file)); return; } ctx.drawImage(img, 0, 0, w, h); resolve(canvas.toDataURL("image/jpeg", quality)); };
      img.onerror = () => resolve(URL.createObjectURL(file)); img.src = URL.createObjectURL(file);
    });
  }
  function recompressDataUrl(dataUrl: string, maxWidth = 800, quality = 0.5): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { const canvas = document.createElement("canvas"); let w = img.width, h = img.height; if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; } canvas.width = w; canvas.height = h; const ctx = canvas.getContext("2d"); if (!ctx) { reject(new Error("no ctx")); return; } ctx.drawImage(img, 0, 0, w, h); canvas.toBlob(blob => { if (blob) resolve(blob); else reject(new Error("toBlob failed")); }, "image/jpeg", quality); };
      img.onerror = () => reject(new Error("img load failed")); img.src = dataUrl;
    });
  }

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (files.length === 0 || !activeStudentId) return;
    const stu = students.find(s => s.id === activeStudentId); const existingCount = stu?.imageUrls.length || 0;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) { const dataUrl = await compressImage(files[i]); dataUrls.push(dataUrl); await saveOneImage(activeStudentId, existingCount + i, dataUrl); }
    setStudents(prev => prev.map(s => s.id !== activeStudentId ? s : { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...dataUrls] })); e.target.value = "";
  }
  async function onDropImages(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragOver(false); if (!activeStudentId) return;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length === 0) return;
    const stu = students.find(s => s.id === activeStudentId); const existingCount = stu?.imageUrls.length || 0;
    const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) { const dataUrl = await compressImage(files[i]); dataUrls.push(dataUrl); await saveOneImage(activeStudentId, existingCount + i, dataUrl); }
    setStudents(prev => prev.map(s => s.id !== activeStudentId ? s : { ...s, images: [...s.images, ...files], imageUrls: [...s.imageUrls, ...dataUrls] }));
  }
  function removeImage(sid: string, idx: number) { setStudents(prev => prev.map(s => { if (s.id !== sid) return s; return { ...s, images: s.images.filter((_, i) => i !== idx), imageUrls: s.imageUrls.filter((_, i) => i !== idx) }; })); }
  function updateStudent(id: string, d: Partial<Student>) { setStudents(prev => prev.map(s => s.id === id ? { ...s, ...d } : s)); }

  async function onPickModelImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []); if (files.length === 0) return;
    const existingCount = modelImageUrls.length; const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) { const url = await compressImage(files[i]); dataUrls.push(url); await saveModelImage(existingCount + i, url); }
    setModelFiles(prev => [...prev, ...files]); setModelImageUrls(prev => [...prev, ...dataUrls]); e.target.value = "";
  }
  async function onDropModelImages(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setModelDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")); if (files.length === 0) return;
    const existingCount = modelImageUrls.length; const dataUrls: string[] = [];
    for (let i = 0; i < files.length; i++) { const url = await compressImage(files[i]); dataUrls.push(url); await saveModelImage(existingCount + i, url); }
    setModelFiles(prev => [...prev, ...files]); setModelImageUrls(prev => [...prev, ...dataUrls]);
  }
  async function removeModelImage(idx: number) {
    const newUrls = modelImageUrls.filter((_, i) => i !== idx); setModelFiles(prev => prev.filter((_, i) => i !== idx)); setModelImageUrls(newUrls); setModelText("");
    await clearModelImages(modelImageUrls.length); for (let i = 0; i < newUrls.length; i++) await saveModelImage(i, newUrls[i]);
  }

  async function gradeOneStudent(sid: string, onP?: (p: number, t: string) => void) {
    const stu = students.find(s => s.id === sid); if (!stu || stu.images.length === 0 && stu.imageUrls.length === 0) return;
    updateStudent(sid, { status: "grading", errorMsg: undefined });
    try {
      let modelAnalysis = modelText;
      if (modelImageUrls.length > 0 && !modelText) {
        onP?.(5, "正在识别范文...");
        const ocrParts: string[] = [];
        for (let bi = 0; bi < modelImageUrls.length; bi++) {
          onP?.(5 + Math.round((bi / modelImageUrls.length) * 10), `正在识别范文（${bi + 1}/${modelImageUrls.length}张）...`);
          const mfd = new FormData();
          const blob = await recompressDataUrl(modelImageUrls[bi]);
          mfd.append("images", new File([blob], "model.jpg", { type: "image/jpeg" }));
          const ocrHeaders: Record<string, string> = {};
          if (customApiKey) ocrHeaders["x-ark-api-key"] = customApiKey;
          if (customEpPro) ocrHeaders["x-ark-ep-pro"] = customEpPro;
          if (customEpFast) ocrHeaders["x-ark-ep-fast"] = customEpFast;
          const mr = await fetch("/api/ocr", { method: "POST", body: mfd, headers: ocrHeaders });
          if (mr.ok) { const { ocrText: partOcr } = await mr.json(); if (partOcr) ocrParts.push(partOcr); }
        }
        const modelOcr = ocrParts.join("\n\n");
        if (modelOcr.trim()) {
          onP?.(15, "范文识别完成，正在分析范文...");
          const mr2 = await fetch("/api/essay-detail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ocrText: modelOcr, gradeInfo: grade + " " + topic, isModelEssay: true, apiKey: customApiKey || undefined, epPro: customEpPro || undefined, epFast: customEpFast || undefined }) });
          if (mr2.ok) { const analysis = await mr2.json(); modelAnalysis = typeof analysis === "string" ? analysis : JSON.stringify(analysis, null, 2); setModelText(modelAnalysis); }
        }
      }
      onP?.(25, "正在OCR识别学生作文...");
      const imgSources: { blob: Blob; name: string }[] = [];
      if (stu.images.length > 0) { for (const f of stu.images) { const dataUrl = await compressImage(f); const blob = await recompressDataUrl(dataUrl); imgSources.push({ blob, name: f.name }); } }
      else { for (const url of stu.imageUrls) { const blob = await recompressDataUrl(url); imgSources.push({ blob, name: "image.jpg" }); } }
      const stuOcrParts: string[] = [];
      for (let bi = 0; bi < imgSources.length; bi++) {
        if (imgSources.length > 1) onP?.(25 + Math.round((bi / imgSources.length) * 25), `正在识别第${bi + 1}/${imgSources.length}页...`);
        const fd = new FormData(); fd.append("images", new File([imgSources[bi].blob], imgSources[bi].name, { type: imgSources[bi].blob.type || "image/jpeg" }));
        const stuOcrHeaders: Record<string, string> = {};
        if (customApiKey) stuOcrHeaders["x-ark-api-key"] = customApiKey;
        if (customEpPro) stuOcrHeaders["x-ark-ep-pro"] = customEpPro;
        if (customEpFast) stuOcrHeaders["x-ark-ep-fast"] = customEpFast;
        const r1 = await fetch("/api/ocr", { method: "POST", body: fd, headers: stuOcrHeaders });
        if (!r1.ok) { const t = await r1.text(); throw new Error("OCR失败: " + (t || r1.statusText)); }
        const { ocrText: partOcr } = await r1.json(); if (partOcr) stuOcrParts.push(partOcr);
      }
      const ocrText = stuOcrParts.join("\n\n"); updateStudent(sid, { ocrText });
      onP?.(55, "文字识别完成，正在AI精批...");
      const r2 = await fetch("/api/essay-detail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ocrText, gradeInfo: grade + " " + topic, modelAnalysis: modelAnalysis || undefined, specialRequirement: specialReq || undefined, apiKey: customApiKey || undefined, epPro: customEpPro || undefined, epFast: customEpFast || undefined }) });
      if (!r2.ok) { const t = await r2.text(); throw new Error("精批失败: " + (t || r2.statusText)); }
      const essayDetail = await r2.json(); updateStudent(sid, { essayDetail, status: "done" }); onP?.(100, "批改完成！");
    } catch (err: any) { updateStudent(sid, { status: "error", errorMsg: err.message || "未知错误" }); throw err; }
  }
  async function runGrading() { if (!activeStudent || (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0)) { alert("请先上传作业照片"); return; } setLoading(true); setProgress(0); setStepText("准备中..."); try { await gradeOneStudent(activeStudentId, (p, t) => { setProgress(p); setStepText(t); }); } catch {} finally { setLoading(false); } }
  async function retryGrading(sid: string) { setLoading(true); setProgress(0); setStepText("重试中..."); try { await gradeOneStudent(sid, (p, t) => { setProgress(p); setStepText(t); }); } catch {} finally { setLoading(false); } }
  async function runBatchGrading() {
    let toGrade: Student[];
    if (selectedForBatch.size > 0) {
      toGrade = students.filter(s => selectedForBatch.has(s.id) && (s.images.length > 0 || s.imageUrls.length > 0));
    } else {
      toGrade = classStudents.filter(s => (s.images.length > 0 || s.imageUrls.length > 0) && s.status !== "done");
    }
    if (toGrade.length === 0) { alert("没有待批改的学生"); return; }
    setLoading(true); let done = 0;
    for (const stu of toGrade) {
      setBatchStatus(`正在批改 ${stu.name}（${done + 1}/${toGrade.length}）...`);
      const base = Math.round((done / toGrade.length) * 100);
      try { await gradeOneStudent(stu.id, (p) => { setProgress(base + Math.round((p / 100) * (100 / toGrade.length))); }); } catch {}
      done++;
    }
    setProgress(100); setBatchStatus(`全部完成！共批改 ${done} 位学生`); setLoading(false); setSelectedForBatch(new Set()); setTimeout(() => setBatchStatus(""), 3000);
  }

  function clipCopy(text: string, msg?: string) { navigator.clipboard.writeText(text).then(() => { setCopyMsg(msg || "已复制！"); setTimeout(() => setCopyMsg(""), 1500); }); }
  function copyOneCorrection(c: any) { clipCopy(c.text + (c.suggested ? " → " + c.suggested : ""), "已复制批注"); }
  function copyOneSuggested(c: any) { clipCopy(c.suggested, "已复制建议"); }
  function copyAllHighlights() { if (!activeStudent?.essayDetail?.highlights) return; clipCopy(activeStudent.essayDetail.highlights.map((h: any, i: number) => `${i + 1}. ${h.title}：${h.description}`).join("\n"), "已复制亮点"); }
  function copyAllTips() { if (!activeStudent?.essayDetail?.improvement_tips) return; clipCopy(activeStudent.essayDetail.improvement_tips.join("\n"), "已复制改进方向"); }
  function copyTeacherComment() { if (!activeStudent?.essayDetail?.teacher_comment) return; clipCopy(activeStudent.essayDetail.teacher_comment, "已复制总评"); }
  function copyModelSuggestion(s: any) { clipCopy(`学生原句：${s.student_text}\n范文参考：${s.model_text}\n建议：${s.suggestion}`, "已复制范文建议"); }
  function copyAllDetail() { if (!activeStudent?.essayDetail) return; const d = activeStudent.essayDetail; let t = `【${activeStudent.name} 作文批改】\n\n━━ 批注 ━━\n`; (d.corrections || []).forEach((c: any, i: number) => { t += `${i + 1}. [${c.paragraph}] ${c.text}${c.suggested ? " → " + c.suggested : ""}\n`; }); if (d.model_suggestions?.length > 0) { t += `\n━━ 范文对比建议 ━━\n`; d.model_suggestions.forEach((s: any, i: number) => { t += `${i + 1}. [${s.paragraph}] ${s.suggestion}\n`; }); } t += `\n━━ 亮点 ━━\n`; (d.highlights || []).forEach((h: any, i: number) => { t += `${i + 1}. ${h.title}：${h.description}\n`; }); if (d.teacher_comment) t += `\n━━ 教师总评 ━━\n${d.teacher_comment}\n`; if (d.improvement_tips) { t += `\n━━ 改进方向 ━━\n`; d.improvement_tips.forEach((tip: string) => t += `${tip}\n`); } clipCopy(t, "已复制全部"); }
  function generateParentNotice() { if (!activeStudent?.essayDetail) return; const d = activeStudent.essayDetail; const name = activeStudent.name; let t = `【${name}作文反馈】\n✨ 亮点：${(d.highlights || []).map((h: any) => h.title).join("、")}\n📝 需改进${(d.corrections || []).filter((c: any) => c.type === "fix").length}处，已在作文上标注\n`; if (d.teacher_comment) t += `💬 ${d.teacher_comment}\n`; t += `请家长督促孩子看批注并改正，感谢配合！`; setParentNotice(t); }

  function addToolboxItem() {
    if (!tbAddName.trim() || !tbAddUrl.trim()) return;
    let url = tbAddUrl.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
    const item: ToolLink = { id: uid(), name: tbAddName.trim(), url, desc: tbAddDesc.trim() || undefined, icon: tbAddIcon || "🔗", folder: tbAddFolder.trim() || undefined };
    setToolboxItems(prev => [...prev, item]);
    setTbAddName(""); setTbAddUrl(""); setTbAddDesc(""); setTbAddIcon("🔗");
  }
  function removeToolboxItem(id: string) { setToolboxItems(prev => prev.filter(t => t.id !== id)); }
  function resetToolbox() { setToolboxItems(DEFAULT_TOOLBOX); setTbCollapsed(new Set()); }
  function moveItemToFolder(itemId: string, folder: string) { setToolboxItems(prev => prev.map(t => t.id === itemId ? { ...t, folder: folder || undefined } : t)); }
  function renameFolder(oldName: string, newName: string) { if (!newName.trim() || oldName === newName) return; setToolboxItems(prev => prev.map(t => t.folder === oldName ? { ...t, folder: newName.trim() } : t)); }
  function deleteFolder(folderName: string) { setToolboxItems(prev => prev.map(t => t.folder === folderName ? { ...t, folder: undefined } : t)); }
  function toggleFolderCollapse(f: string) { setTbCollapsed(prev => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; }); }
  function getToolboxFolders(): string[] { const folders = new Set<string>(); toolboxItems.forEach(t => { if (t.folder) folders.add(t.folder); }); return Array.from(folders); }
  function deleteHistoryRecord(studentId: string, histIdx: number) { setStudents(prev => prev.map(s => { if (s.id !== studentId || !s.history) return s; const nh = s.history.filter((_, i) => i !== histIdx); return { ...s, history: nh }; })); }

  function toggleBatchSelect(id: string) { setSelectedForBatch(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function selectAllForBatch() { const ids = classStudents.map(s => s.id); setSelectedForBatch(new Set(ids)); }
  function deselectAllForBatch() { setSelectedForBatch(new Set()); }

  function tabStyle(t: TabName): React.CSSProperties { return { padding: "10px 24px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontWeight: 600, fontSize: "15px", background: tab === t ? "#fff" : "transparent", color: tab === t ? PRIMARY : "#999", borderBottom: tab === t ? "2px solid " + PRIMARY : "2px solid transparent" }; }
  const toolDefs: { k: Tool; l: string; ic: string; key: string }[] = [{ k: "pen", l: "画笔 (1)", ic: "✏️", key: "1" }, { k: "hand", l: "拖拽 (2)", ic: "🖐", key: "2" }, { k: "text", l: "文字 (3)", ic: "T", key: "3" }, { k: "circle", l: "圆圈 (4)", ic: "⭕", key: "4" }, { k: "wavy", l: "波浪线 (5)", ic: "〰", key: "5" }, { k: "eraser", l: "整体删除 (6)", ic: "🧹", key: "6" }, { k: "penEraser", l: "局部擦除 (7)", ic: "🩹", key: "7" }];
  const cpBtnS: React.CSSProperties = { background: "transparent", border: "none", cursor: "pointer", color: "#aaa", fontSize: 13, padding: "2px 6px", borderRadius: 4 };

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "'Noto Sans SC','Microsoft YaHei',sans-serif", color: "#333" }}>
      {/* Full-screen drop overlay */}
      {globalDragOver && (
        <div onDrop={onGlobalDrop} onDragOver={e => e.preventDefault()} style={{ position: "fixed", inset: 0, zIndex: 10000, background: "rgba(45,74,62,0.08)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: "48px 64px", textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.1)", border: "2px dashed " + PRIMARY_MID, transform: "scale(1)", animation: "none" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: PRIMARY_LIGHT, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>+</div>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1F2937" }}>释放以导入作业照片</p>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "#9CA3AF" }}>{activeStudentId ? "将添加到当前选中的学生" : "请先选择一个学生"}</p>
          </div>
        </div>
      )}
      {previewUrl && <div onClick={() => setPreviewUrl(null)} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}><button onClick={() => setPreviewUrl(null)} style={{ position: "absolute", top: 20, right: 20, width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 24, cursor: "pointer" }}>✕</button><img src={previewUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 8 }} /></div>}
      {copyMsg && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: GREEN, color: "#fff", padding: "8px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>{copyMsg}</div>}
      {parentNotice && <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 420, width: "90%" }}><h3 style={{ marginBottom: 12 }}>家长通知</h3><pre style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.8, background: "#f9f9f9", padding: 12, borderRadius: 8 }}>{parentNotice}</pre><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={() => { clipCopy(parentNotice, "已复制通知"); }} style={{ flex: 1, padding: 8, borderRadius: 6, border: "none", background: GREEN, color: "#fff", cursor: "pointer", fontWeight: 600 }}>复制</button><button onClick={() => setParentNotice(null)} style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer" }}>关闭</button></div></div></div>}

      {/* Award Links Modal */}
      {showAward && <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowAward(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 520, width: "95%", maxHeight: "85vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1F2937" }}>奖状生成工具</h3>
            <button onClick={() => setShowAward(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8E4", background: "#fff", cursor: "pointer", fontSize: 16, color: "#9CA3AF" }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 12px", lineHeight: 1.6 }}>点击跳转使用，或编辑管理工具列表：</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(toolboxItems.filter(t => t.folder === "奖状生成").length > 0 ? toolboxItems.filter(t => t.folder === "奖状生成") : DEFAULT_TOOLBOX.filter(t => t.folder === "奖状生成")).map(site => (
              <div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <a href={site.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, border: "1px solid #E8E8E4", background: "#fff", textDecoration: "none", color: "#374151", transition: "all 0.15s" }} onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = PRIMARY_MID; (e.currentTarget as HTMLAnchorElement).style.background = PRIMARY_LIGHT; }} onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#E8E8E4"; (e.currentTarget as HTMLAnchorElement).style.background = "#fff"; }}>
                  <span style={{ fontSize: 24, flexShrink: 0, width: 32, textAlign: "center" }}>{site.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{site.name}</p>
                    {site.desc && <p style={{ margin: "1px 0 0", fontSize: 10, color: "#9CA3AF" }}>{site.desc}</p>}
                  </div>
                  <span style={{ fontSize: 14, color: "#D1D5DB", flexShrink: 0 }}>→</span>
                </a>
                <button onClick={() => { if (confirm("删除「" + site.name + "」？")) removeToolboxItem(site.id); }} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: RED, fontSize: 12, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
            ))}
          </div>
          {/* Quick add in award modal */}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px dashed #D1D5DB", background: "#FAFAF8" }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>添加奖状工具</p>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={tbAddName} onChange={e => setTbAddName(e.target.value)} placeholder="名称" style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
              <input value={tbAddUrl} onChange={e => setTbAddUrl(e.target.value)} placeholder="网址" style={{ flex: 2, padding: "5px 8px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
              <button onClick={() => { if (tbAddName.trim() && tbAddUrl.trim()) { let url = tbAddUrl.trim(); if (!url.startsWith("http")) url = "https://" + url; setToolboxItems(prev => [...prev, { id: uid(), name: tbAddName.trim(), url, icon: "🏆", folder: "奖状生成", desc: tbAddDesc.trim() || undefined }]); setTbAddName(""); setTbAddUrl(""); setTbAddDesc(""); } }} disabled={!tbAddName.trim() || !tbAddUrl.trim()} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: !tbAddName.trim() || !tbAddUrl.trim() ? "#D1D5DB" : PRIMARY, color: "#fff", fontSize: 12, cursor: !tbAddName.trim() || !tbAddUrl.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>添加</button>
            </div>
          </div>
        </div>
      </div>}

      {/* Toolbox Modal */}
      {showToolbox && <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowToolbox(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 560, width: "95%", maxHeight: "85vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1F2937" }}>教师工具箱</h3>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={() => setTbEditing(!tbEditing)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #E0E0DC", background: tbEditing ? PRIMARY_LIGHT : "#fff", color: tbEditing ? PRIMARY : "#6B7280", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{tbEditing ? "完成" : "编辑"}</button>
              <button onClick={() => setShowToolbox(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8E4", background: "#fff", cursor: "pointer", fontSize: 16, color: "#9CA3AF" }}>✕</button>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 14px", lineHeight: 1.6 }}>收藏常用教学工具，按文件夹分类管理。拖拽工具到文件夹可归类。</p>

          {/* Folders */}
          {(() => {
            const folders = getToolboxFolders();
            const ungrouped = toolboxItems.filter(t => !t.folder);
            const renderItem = (item: ToolLink) => (
              <div key={item.id} draggable={tbEditing} onDragStart={() => setTbDragId(item.id)} onDragEnd={() => setTbDragId(null)} style={{ display: "flex", alignItems: "center", gap: 8, opacity: tbDragId === item.id ? 0.4 : 1 }}>
                <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: "1px solid #E8E8E4", background: "#fff", textDecoration: "none", color: "#374151", transition: "all 0.15s", cursor: tbEditing ? "grab" : "pointer" }} onMouseEnter={e => { if (!tbEditing) { (e.currentTarget as HTMLElement).style.borderColor = PRIMARY_MID; (e.currentTarget as HTMLElement).style.background = PRIMARY_LIGHT; } }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#E8E8E4"; (e.currentTarget as HTMLElement).style.background = "#fff"; }}>
                  <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: "center" }}>{item.icon || "🔗"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{item.name}</p>
                    {item.desc && <p style={{ margin: "1px 0 0", fontSize: 10, color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.desc}</p>}
                  </div>
                  <span style={{ fontSize: 12, color: "#D1D5DB", flexShrink: 0 }}>→</span>
                </a>
                {tbEditing && <button onClick={() => removeToolboxItem(item.id)} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: RED, fontSize: 11, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
              </div>
            );
            return <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {folders.map(folder => {
                const items = toolboxItems.filter(t => t.folder === folder);
                const isOpen = !tbCollapsed.has(folder);
                return <div key={folder} onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.outline = "2px dashed " + PRIMARY_MID; }} onDragLeave={e => { (e.currentTarget as HTMLElement).style.outline = "none"; }} onDrop={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.outline = "none"; if (tbDragId) { moveItemToFolder(tbDragId, folder); setTbDragId(null); } }} style={{ borderRadius: 10, border: "1px solid #E8E8E4", overflow: "hidden" }}>
                  <div onClick={() => toggleFolderCollapse(folder)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: PRIMARY_LIGHT, cursor: "pointer", userSelect: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: PRIMARY }}>📁 {folder}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>({items.length})</span>
                    </div>
                    {tbEditing && <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => { const n = prompt("重命名文件夹", folder); if (n) renameFolder(folder, n); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #E0E0DC", background: "#fff", fontSize: 10, cursor: "pointer", color: "#6B7280" }}>改名</button>
                      <button onClick={() => { if (confirm("解散文件夹「" + folder + "」？工具将移到未分类")) deleteFolder(folder); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #FECACA", background: "#FEF2F2", fontSize: 10, cursor: "pointer", color: RED }}>解散</button>
                    </div>}
                  </div>
                  {isOpen && <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6, background: "#FAFAF8" }}>
                    {items.map(renderItem)}
                  </div>}
                </div>;
              })}
              {/* Ungrouped */}
              {ungrouped.length > 0 && <div onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (tbDragId) { moveItemToFolder(tbDragId, ""); setTbDragId(null); } }}>
                {folders.length > 0 && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 6px", fontWeight: 600 }}>未分类</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {ungrouped.map(renderItem)}
                </div>
              </div>}
              {toolboxItems.length === 0 && <p style={{ textAlign: "center", color: "#D1D5DB", padding: "20px 0", fontSize: 13 }}>工具箱是空的，点击下方添加</p>}
            </div>;
          })()}

          {/* Add new folder */}
          {tbEditing && <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input value={tbNewFolder} onChange={e => setTbNewFolder(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && tbNewFolder.trim()) { const existing = getToolboxFolders(); if (!existing.includes(tbNewFolder.trim())) { setToolboxItems(prev => [...prev, { id: uid(), name: "示例工具", url: "https://example.com", icon: "🔗", folder: tbNewFolder.trim(), desc: "点击编辑修改" }]); } setTbNewFolder(""); } }} placeholder="新建文件夹名称…" style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
            <button onClick={() => { if (tbNewFolder.trim()) { setToolboxItems(prev => [...prev, { id: uid(), name: "示例工具", url: "https://example.com", icon: "🔗", folder: tbNewFolder.trim(), desc: "点击编辑修改" }]); setTbNewFolder(""); } }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", fontSize: 12, cursor: "pointer", color: "#6B7280", whiteSpace: "nowrap" }}>+ 文件夹</button>
          </div>}

          {/* Quick add */}
          <div style={{ padding: 14, borderRadius: 10, border: "1px dashed #D1D5DB", background: "#FAFAF8" }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#374151" }}>添加工具</p>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 10px", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>图标</span>
              <div style={{ display: "flex", gap: 3 }}>
                {["🔗", "📝", "📖", "🎯", "💡", "🔍", "📊", "🎨", "🏆", "🎮"].map(ic => (
                  <button key={ic} onClick={() => setTbAddIcon(ic)} style={{ width: 28, height: 28, borderRadius: 5, border: tbAddIcon === ic ? "2px solid " + PRIMARY : "1px solid #E0E0DC", background: tbAddIcon === ic ? PRIMARY_LIGHT : "#fff", cursor: "pointer", fontSize: 13 }}>{ic}</button>
                ))}
              </div>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>名称</span>
              <input value={tbAddName} onChange={e => setTbAddName(e.target.value)} placeholder="如：古诗词查询" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>链接</span>
              <input value={tbAddUrl} onChange={e => setTbAddUrl(e.target.value)} placeholder="https://..." style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>说明</span>
              <input value={tbAddDesc} onChange={e => setTbAddDesc(e.target.value)} placeholder="选填" style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 12, outline: "none" }} />
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>分类</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <button onClick={() => setTbAddFolder("")} style={{ padding: "3px 10px", borderRadius: 5, border: !tbAddFolder ? "1px solid " + PRIMARY : "1px solid #E0E0DC", background: !tbAddFolder ? PRIMARY_LIGHT : "#fff", fontSize: 11, cursor: "pointer", color: !tbAddFolder ? PRIMARY : "#6B7280" }}>未分类</button>
                {getToolboxFolders().map(f => (
                  <button key={f} onClick={() => setTbAddFolder(f)} style={{ padding: "3px 10px", borderRadius: 5, border: tbAddFolder === f ? "1px solid " + PRIMARY : "1px solid #E0E0DC", background: tbAddFolder === f ? PRIMARY_LIGHT : "#fff", fontSize: 11, cursor: "pointer", color: tbAddFolder === f ? PRIMARY : "#6B7280" }}>{f}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={addToolboxItem} disabled={!tbAddName.trim() || !tbAddUrl.trim()} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: !tbAddName.trim() || !tbAddUrl.trim() ? "#D1D5DB" : PRIMARY, color: "#fff", fontSize: 13, fontWeight: 600, cursor: !tbAddName.trim() || !tbAddUrl.trim() ? "not-allowed" : "pointer" }}>添加</button>
              <button onClick={resetToolbox} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#6B7280", fontSize: 12, cursor: "pointer" }}>恢复默认</button>
            </div>
          </div>
        </div>
      </div>}

      {/* Settings Modal */}
      {showSettings && <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={() => setShowSettings(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "90%", maxWidth: 440, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
          <div style={{ padding: "28px 28px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1F2937" }}>语文作业智能批改</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: "#9CA3AF" }}>v1.0 · AI-Powered Essay Grading</p></div>
            <button onClick={() => setShowSettings(false)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid #E8E8E4", background: "#fff", cursor: "pointer", fontSize: 16, color: "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
          <div style={{ padding: "20px 28px" }}>
            <div style={{ background: PRIMARY_LIGHT, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#374151" }}>拍照上传小学语文作业，AI 自动识别手写文字并进行作文精批，生成修改建议、亮点分析和教师评语。</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {[{ title: "OCR 识别", desc: "手写文字自动转文本" }, { title: "智能批改", desc: "AI 逐段精批+总评" }, { title: "图上标注", desc: "画笔、圆圈、文字批注" }, { title: "教师工具箱", desc: "奖状·字帖·自定义工具" }].map((f, i) => (
                <div key={i} style={{ padding: "14px 12px", borderRadius: 10, border: "1px solid #E8E8E4", background: "#fff" }}><p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#374151" }}>{f.title}</p><p style={{ margin: 0, fontSize: 11, color: "#9CA3AF" }}>{f.desc}</p></div>
              ))}
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 10, background: "#F0F7F2", border: "1px solid #D4E5D9", marginBottom: 20 }}><p style={{ margin: 0, fontSize: 13, color: GREEN, fontWeight: 600 }}>免费使用</p><p style={{ margin: "4px 0 0", fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>默认使用系统提供的 AI 服务，直接上传照片即可开始批改，无需任何配置。</p></div>
            <div onClick={() => setShowAdvanced(!showAdvanced)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, border: "1px solid #E8E8E4", cursor: "pointer", background: showAdvanced ? PRIMARY_LIGHT : "#fff", transition: "all 0.2s" }}>
              <div><p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#374151" }}>高级设置</p><p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF" }}>自定义 API 接入（开发者选项）</p></div>
              <span style={{ fontSize: 12, color: "#9CA3AF", transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>
            {showAdvanced && <div style={{ marginTop: 12, padding: 16, borderRadius: 10, border: "1px solid #E8E8E4", background: "#FAFAF8" }}>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 14, lineHeight: 1.6 }}>如需使用自己的豆包（火山引擎 Ark）API，请填写以下信息。留空则使用系统默认配置。</p>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>API Key</label><input value={customApiKey} onChange={e => setCustomApiKey(e.target.value)} placeholder="留空使用默认" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Pro 接入点 ID（精批模型）</label><input value={customEpPro} onChange={e => setCustomEpPro(e.target.value)} placeholder="如 ep-2024xxxxxxxxxx-xxxxx" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 4 }}>Fast 接入点 ID（OCR模型）</label><input value={customEpFast} onChange={e => setCustomEpFast(e.target.value)} placeholder="如 ep-2024xxxxxxxxxx-xxxxx" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
              <button onClick={() => { try { localStorage.setItem("hw_api_settings", JSON.stringify({ apiKey: customApiKey, epPro: customEpPro, epFast: customEpFast })); } catch {} setShowSettings(false); setCopyMsg("设置已保存"); setTimeout(() => setCopyMsg(""), 1500); }} style={{ width: "100%", padding: "10px 0", borderRadius: 8, border: "none", background: PRIMARY, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>保存设置</button>
              <p style={{ fontSize: 10, color: "#D1D5DB", marginTop: 8, textAlign: "center", lineHeight: 1.5 }}>API Key 仅保存在浏览器本地，不会上传至服务器</p>
            </div>}

            <div onClick={() => setShowTutorial(!showTutorial)} style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, border: "1px solid #E8E8E4", cursor: "pointer", background: showTutorial ? "#FAFAF8" : "#fff", transition: "all 0.2s" }}>
              <div><p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#374151" }}>使用教程</p><p style={{ margin: "2px 0 0", fontSize: 11, color: "#9CA3AF" }}>操作说明与快捷键</p></div>
              <span style={{ fontSize: 12, color: "#9CA3AF", transform: showTutorial ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
            </div>
            {showTutorial && <div style={{ marginTop: 8, padding: "16px", borderRadius: 10, border: "1px solid #E8E8E4", background: "#FAFAF8" }}>
              <div style={{ fontSize: 12, lineHeight: 2, color: "#6B7280" }}>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>1. 添加学生：</strong>在&ldquo;上传作业&rdquo;页输入姓名，点添加。可建多个班级管理。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>2. 上传照片：</strong>选中学生后，点击或拖拽照片到上传区。支持多页作文。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>3. 开始批改：</strong>点&ldquo;批改&rdquo;按钮，AI 自动识别文字并生成批改结果。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>4. 图上标注：</strong>在批改详情页用画笔、文字、圆圈等工具在作文图上批注。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>5. 快捷批语：</strong>点击&ldquo;好词&rdquo;&ldquo;错字&rdquo;等标签后，在图上点击放置。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>6. 修改文字：</strong>双击已有文字可编辑，修改字号后点击空白处保存。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>7. 删除批注：</strong>鼠标靠近批注出现虚线框，按 Backspace/Delete 删除。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>8. 导出：</strong>点&ldquo;导出&rdquo;下载批注图片，点&ldquo;复制&rdquo;可直接粘贴到微信。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>9. 奖状：</strong>在批改详情页点&ldquo;奖状&rdquo;，跳转到专业在线奖状生成器制作精美奖状。</p>
                <p style={{ margin: "0 0 6px" }}><strong style={{ color: "#374151" }}>10. 工具箱：</strong>点右上角工具箱按钮打开教师工具箱，收藏常用教学网站和工具，可自由添加、删除。</p>
                <p style={{ margin: 0 }}><strong style={{ color: "#374151" }}>11. 快捷键：</strong>1-7 切换工具，Ctrl+Z 撤销，Ctrl+Y 重做，Esc 取消。</p>
              </div>
            </div>}
          </div>
          <div style={{ padding: "16px 28px 24px", borderTop: "1px solid #E8E8E4", textAlign: "center" }}><p style={{ margin: 0, fontSize: 11, color: "#D1D5DB" }}>Made for teachers · Powered by AI</p></div>
        </div>
      </div>}

      {tab !== "detail" && <div style={{ background: "#fff", padding: isMobile ? "10px 16px" : "12px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, borderBottom: "1px solid #E8E8E4" }}>
        <div><h1 style={{ fontSize: isMobile ? 16 : 19, fontWeight: 700, color: "#1F2937", margin: 0, letterSpacing: 0.5 }}>语文作业智能批改</h1><p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>上传照片 · AI批注 · 导出</p></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={runBatchGrading} disabled={loading} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "none", background: PRIMARY, color: "#fff", fontSize: isMobile ? 11 : 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}>批改全部</button>
          <button onClick={exportAllPNGs} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#374151", fontSize: isMobile ? 11 : 13, fontWeight: 500, cursor: "pointer" }}>导出图片</button>
          <button onClick={exportData} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#374151", fontSize: isMobile ? 11 : 13, fontWeight: 500, cursor: "pointer" }}>备份</button>
          <button onClick={() => importFileRef.current?.click()} style={{ padding: isMobile ? "6px 10px" : "8px 18px", borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#374151", fontSize: isMobile ? 11 : 13, fontWeight: 500, cursor: "pointer" }}>恢复</button>
          <button onClick={() => setShowToolbox(true)} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#6B7280", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="工具箱">🧰</button>
          <button onClick={() => setShowSettings(true)} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E0E0DC", background: "#fff", color: "#6B7280", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title="设置">⚙</button>
          <input ref={importFileRef} type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
        </div>
      </div>}
      {batchStatus && <div style={{ background: "#F0F7F2", padding: "10px 32px", fontSize: 14, fontWeight: 600, color: GREEN, borderBottom: "1px solid #D4E5D9" }}>{batchStatus}</div>}

      <div style={{ maxWidth: tab === "detail" ? "none" : 1400, margin: "0 auto", padding: tab === "detail" ? "8px 12px" : "8px 20px" }}>
        {tab !== "detail" && <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #E8E8E4", marginBottom: 10 }}><button style={tabStyle("upload")} onClick={() => setTab("upload")}>上传作业</button><button style={tabStyle("detail")} onClick={() => setTab("detail")}>批改详情</button><button style={tabStyle("archive")} onClick={() => setTab("archive")}>储存箱{students.filter(s => s.archived).length > 0 ? ` (${students.filter(s => s.archived).length})` : ""}</button></div>}

        {tab === "upload" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", marginBottom: 16, background: "#fff", borderRadius: 10, border: "1px solid #E8E8E4" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "#6B7280" }}>
                <span>当前：<strong style={{ color: "#374151" }}>{grade}</strong></span>
                <span style={{ color: "#D1D5DB" }}>|</span>
                <span><strong style={{ color: "#374151" }}>{topic}</strong></span>
                {specialReq && <><span style={{ color: "#D1D5DB" }}>|</span><span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block", verticalAlign: "bottom" }}>要求：{specialReq}</span></>}
                {modelImageUrls.length > 0 && <><span style={{ color: "#D1D5DB" }}>|</span><span style={{ color: GREEN }}>范文 {modelImageUrls.length} 张</span></>}
              </div>
              <button onClick={() => setShowConfig(!showConfig)} style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid #E0E0DC", background: showConfig ? PRIMARY_LIGHT : "#fff", color: showConfig ? PRIMARY : "#6B7280", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>{showConfig ? "收起配置" : "修改配置"}</button>
            </div>

            <div style={{ maxHeight: showConfig ? 280 : 0, overflow: "hidden", transition: "max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease", opacity: showConfig ? 1 : 0, marginBottom: showConfig ? 16 : 0 }}>
              <div style={{ padding: 20, borderRadius: 12, border: "1px solid #E8E8E4", background: "#fff" }}>
                <div style={{ display: "flex", gap: 16, marginBottom: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 160px", minWidth: 140 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 4 }}>年级</label><select value={grade} onChange={e => setGrade(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none" }}>{["一年级上","一年级下","二年级上","二年级下","三年级上","三年级下","四年级上","四年级下","五年级上","五年级下","六年级上","六年级下"].map(g => <option key={g}>{g}</option>)}</select></div>
                  <div style={{ flex: "1 1 160px", minWidth: 140 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 4 }}>主题</label><select value={topic} onChange={e => setTopic(e.target.value)} style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none" }}>{["看图写话","写人","记事","写景","状物","想象作文","日记","书信","读后感","中华传统节日","自由命题","童话","其他"].map(t => <option key={t}>{t}</option>)}</select></div>
                  <div style={{ flex: "2 1 280px", minWidth: 200 }}><label style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 4 }}>特殊要求（选填）</label><input value={specialReq} onChange={e => setSpecialReq(e.target.value)} placeholder="例如：注意想象力和拟人手法…" style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 12, outline: "none", boxSizing: "border-box" }} /></div>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 6 }}>范文模板（选填，可拖拽多张）</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 8, borderRadius: 8, border: modelDragOver ? "2px dashed " + PRIMARY : "1px dashed #D1D5DB", background: modelDragOver ? PRIMARY_LIGHT : "#FAFAF8", minHeight: 36, transition: "all 0.2s" }} onDrop={onDropModelImages} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setModelDragOver(true); }} onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setModelDragOver(false); }}>
                    {modelImageUrls.map((url, i) => (<div key={i} onClick={() => setPreviewUrl(url)} style={{ width: 50, height: 65, borderRadius: 6, overflow: "hidden", border: "1px solid #E0E0DC", position: "relative", cursor: "pointer", flexShrink: 0 }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button onClick={e => { e.stopPropagation(); removeModelImage(i); }} style={{ position: "absolute", top: 1, right: 1, width: 14, height: 14, borderRadius: "50%", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", cursor: "pointer", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button></div>))}
                    <div onClick={() => modelFileRef.current?.click()} style={{ width: 50, height: 65, borderRadius: 6, border: "2px dashed #D1D5DB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#fff", color: "#9CA3AF", fontSize: 9, flexShrink: 0 }}><span style={{ fontSize: 18 }}>+</span><span>范文</span></div>
                    <input ref={modelFileRef} type="file" accept="image/*" multiple onChange={onPickModelImages} style={{ display: "none" }} />
                  </div>
                  {modelText && <p style={{ fontSize: 11, color: GREEN, marginTop: 4 }}>范文已分析（复用中）</p>}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 16 : 24 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 4, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {classNames.map(cn => (
                    <div key={cn} style={{ display: "inline-flex", alignItems: "center" }}>
                      <button onClick={() => { setCurrentClass(cn); setActiveStudentId(students.find(s => !s.archived && s.className === cn)?.id || ""); }} style={{ padding: "5px 14px", borderRadius: cn !== "默认班" ? "6px 0 0 6px" : 6, border: currentClass === cn ? "1px solid " + PRIMARY : "1px solid #E0E0DC", cursor: "pointer", background: currentClass === cn ? PRIMARY_LIGHT : "#fff", color: currentClass === cn ? PRIMARY : "#6B7280", fontWeight: 600, fontSize: 12, transition: "all 0.15s" }}>{cn}</button>
                      {cn !== "默认班" && <button onClick={() => deleteClass(cn)} title={"删除班级 " + cn} style={{ padding: "5px 6px", borderRadius: "0 6px 6px 0", border: currentClass === cn ? "1px solid " + PRIMARY : "1px solid #E0E0DC", borderLeft: "none", cursor: "pointer", background: currentClass === cn ? PRIMARY_MID : "#f5f5f3", color: currentClass === cn ? PRIMARY : "#999", fontSize: 10 }}>✕</button>}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input value={newClassName} onChange={e => setNewClassName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newClassName.trim()) { if (!classNames.includes(newClassName.trim())) setClassNames(prev => [...prev, newClassName.trim()]); setCurrentClass(newClassName.trim()); setNewClassName(""); } }} placeholder="新班级" style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 11, outline: "none" }} />
                    <button onClick={() => { if (newClassName.trim() && !classNames.includes(newClassName.trim())) { setClassNames(prev => [...prev, newClassName.trim()]); setCurrentClass(newClassName.trim()); setNewClassName(""); } }} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", fontSize: 11, cursor: "pointer", color: "#6B7280" }}>+</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索学生…" style={{ width: "100%", padding: "7px 12px 7px 30px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#D1D5DB", pointerEvents: "none" }}>🔍</span>
                    {searchQuery && <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}>✕</button>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addStudent()} placeholder="输入学生姓名" style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 13, outline: "none" }} />
                  <button onClick={addStudent} style={{ padding: "8px 10px", borderRadius: 8, border: "none", background: PRIMARY, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", transition: "opacity 0.15s" }}>添加</button>
                </div>

                {classStudents.length > 0 && <div style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "center" }}>
                  <button onClick={selectAllForBatch} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", fontSize: 11, cursor: "pointer", color: "#6B7280" }}>全选</button>
                  <button onClick={deselectAllForBatch} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", fontSize: 11, cursor: "pointer", color: "#6B7280" }}>取消全选</button>
                  {selectedForBatch.size > 0 && <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 600 }}>已选 {selectedForBatch.size} 人</span>}
                  {selectedForBatch.size > 0 && <button disabled={loading} onClick={runBatchGrading} style={{ padding: "3px 12px", borderRadius: 6, border: "none", background: PRIMARY, color: "#fff", fontSize: 11, cursor: "pointer", fontWeight: 600, marginLeft: 4 }}>批改已选</button>}
                </div>}

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                  {classStudents.length === 0 && <p style={{ fontSize: 13, color: "#D1D5DB", textAlign: "center", padding: "20px 0" }}>请先添加学生</p>}
                  {classStudents.map(s => (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={selectedForBatch.has(s.id)} onChange={() => toggleBatchSelect(s.id)} style={{ cursor: "pointer", accentColor: PRIMARY }} />
                    <div onClick={() => { if (editingNameId !== s.id) { setActiveStudentId(s.id); setPageIndex(0); } }} style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: activeStudentId === s.id ? PRIMARY_LIGHT : "#fff", color: activeStudentId === s.id ? PRIMARY : "#374151", border: activeStudentId === s.id ? "1px solid " + PRIMARY_MID : "1px solid #E8E8E4", borderLeft: activeStudentId === s.id ? "3px solid " + PRIMARY : "1px solid #E8E8E4", transition: "all 0.15s" }}>
                    <div>{editingNameId === s.id ? <input autoFocus value={editingNameVal} onChange={e => setEditingNameVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && editingNameVal.trim()) { updateStudent(s.id, { name: editingNameVal.trim() }); setEditingNameId(null); } if (e.key === "Escape") setEditingNameId(null); }} onBlur={() => { if (editingNameVal.trim()) updateStudent(s.id, { name: editingNameVal.trim() }); setEditingNameId(null); }} onClick={e => e.stopPropagation()} style={{ width: 80, padding: "2px 6px", borderRadius: 4, border: "1px solid " + PRIMARY, fontSize: 14, fontWeight: 600, outline: "none", background: "#fff", color: PRIMARY }} /> : <span onDoubleClick={e => { e.stopPropagation(); setEditingNameId(s.id); setEditingNameVal(s.name); }} style={{ fontWeight: 600, fontSize: 14, cursor: "text" }} title="双击修改姓名">{s.name}</span>}<span style={{ marginLeft: 8, fontSize: 11, padding: "2px 6px", borderRadius: 4, background: s.status === "done" ? GREEN : s.status === "grading" ? ORANGE : s.status === "error" ? RED : "#f0f0ee", color: s.status === "idle" ? "#9CA3AF" : "#fff" }}>{s.status === "done" ? "已批改" : s.status === "grading" ? "批改中" : s.status === "error" ? "出错" : (s.images.length || s.imageUrls.length) + "张"}</span></div>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {s.status === "error" && <button onClick={e => { e.stopPropagation(); retryGrading(s.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: ORANGE, fontSize: 12, fontWeight: 600 }}>重试</button>}
                      {s.status === "done" && <button onClick={e => { e.stopPropagation(); archiveStudent(s.id); }} title="归档" style={{ background: "transparent", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 12 }}>归档</button>}
                      <button onClick={e => { e.stopPropagation(); removeStudent(s.id); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#D1D5DB", fontSize: 16 }}>✕</button>
                    </div>
                  </div></div>))}
                </div>
              </div>

              {activeStudent && activeStudent.className === currentClass && (
                <div style={{ width: isMobile ? "100%" : 360, flexShrink: 0 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#374151" }}>{activeStudent.name} 的作业照片</h4>
                  {activeStudent.status === "error" && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: 10, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}><span style={{ color: RED, flex: 1, wordBreak: "break-all" }}>{activeStudent.errorMsg || "出错"}</span><button onClick={() => retryGrading(activeStudent.id)} disabled={loading} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: ORANGE, color: "#fff", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", marginLeft: 8 }}>重试</button></div>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: 16, borderRadius: 10, border: dragOver ? "2px dashed " + PRIMARY : "1px dashed #D1D5DB", background: dragOver ? PRIMARY_LIGHT : "#fff", marginBottom: 16, transition: "all 0.2s" }} onDrop={onDropImages} onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }} onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}>
                    {activeStudent.imageUrls.map((url, i) => (<div key={i} onClick={() => setPreviewUrl(url)} style={{ width: 80, height: 105, borderRadius: 8, overflow: "hidden", border: "1px solid #E0E0DC", position: "relative", cursor: "pointer", flexShrink: 0 }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /><button onClick={e => { e.stopPropagation(); removeImage(activeStudent.id, i); }} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button><div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.35)", color: "#fff", fontSize: 9, textAlign: "center", padding: 2 }}>{"第" + (i + 1) + "页"}</div></div>))}
                    <div onClick={() => addFileInputRef.current?.click()} style={{ width: 80, height: 105, borderRadius: 8, border: "2px dashed #D1D5DB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "#FAFAF8", color: "#9CA3AF", flexShrink: 0 }}><span style={{ fontSize: 24 }}>+</span><span style={{ fontSize: 10 }}>拖拽或点击</span><input ref={addFileInputRef} type="file" accept="image/*" multiple onChange={onPickImages} style={{ display: "none" }} /></div>
                  </div>
                  <button disabled={(activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading} onClick={runGrading} style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, color: "#fff", cursor: (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading ? "not-allowed" : "pointer", background: (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) || loading ? "#D1D5DB" : PRIMARY, transition: "background 0.2s" }}>{loading ? stepText : "批改 " + activeStudent.name + "（" + (activeStudent.images.length || activeStudent.imageUrls.length) + " 张）"}</button>
                  {loading && <div style={{ marginTop: 10 }}><div style={{ width: "100%", height: 4, borderRadius: 2, background: "#E8E8E4" }}><div style={{ width: progress + "%", height: "100%", borderRadius: 2, background: PRIMARY, transition: "width 0.5s" }} /></div><p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 4 }}>{progress}% · {stepText}</p></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "detail" && <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <button onClick={() => setTab("upload")} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", color: "#6B7280", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>← 返回</button>
            <div style={{ display: "flex", gap: 6 }}>
              {activeStudent?.status === "done" && <button onClick={copyAllDetail} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid " + PRIMARY, background: "transparent", color: PRIMARY, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>复制全部</button>}
              {activeStudent?.status === "done" && <button onClick={generateParentNotice} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid " + GREEN, background: "transparent", color: GREEN, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>家长通知</button>}
              {activeStudent?.status === "done" && <button onClick={() => setShowAward(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid " + ORANGE, background: "transparent", color: ORANGE, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>奖状</button>}
            </div>
          </div>
          {!activeStudent && <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#9CA3AF", marginBottom: 8 }}>请先选择一个学生</p>
            <p style={{ fontSize: 13, color: "#D1D5DB" }}>在&ldquo;上传作业&rdquo;页面添加学生后，可以在这里查看批改结果</p>
          </div>}
          {activeStudent && activeStudent.status === "idle" && (activeStudent.images.length === 0 && activeStudent.imageUrls.length === 0) && <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#9CA3AF", marginBottom: 8 }}>{activeStudent.name} 还没有上传作业照片</p>
            <p style={{ fontSize: 13, color: "#D1D5DB" }}>请先在&ldquo;上传作业&rdquo;页面上传照片</p>
          </div>}
          {activeStudent && activeStudent.status === "idle" && (activeStudent.images.length > 0 || activeStudent.imageUrls.length > 0) && <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#9CA3AF", marginBottom: 8 }}>{activeStudent.name} 还没有批改</p>
            <p style={{ fontSize: 13, color: "#D1D5DB" }}>已上传 {activeStudent.images.length || activeStudent.imageUrls.length} 张照片，请在&ldquo;上传作业&rdquo;页面点击批改</p>
          </div>}
          {activeStudent && activeStudent.status === "grading" && <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: ORANGE, marginBottom: 8 }}>{activeStudent.name} 正在批改中…</p>
            <p style={{ fontSize: 13, color: "#D1D5DB" }}>请稍候</p>
          </div>}
          {activeStudent && activeStudent.status === "error" && <div style={{ textAlign: "center", padding: "80px 20px" }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: RED, marginBottom: 8 }}>{activeStudent.name} 批改出错</p>
            <p style={{ fontSize: 13, color: "#D1D5DB" }}>{activeStudent.errorMsg || "请在「上传作业」页面重试"}</p>
          </div>}
          {activeStudent?.status === "done" && <div ref={splitContainerRef} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 0, position: "relative" }}>
            <div style={{ flex: isMobile ? "auto" : `0 0 ${splitPct}%`, display: "flex", flexDirection: "column", overflow: "auto", minWidth: isMobile ? "auto" : "30%", maxWidth: isMobile ? "none" : "80%" }}>
              <div id="canvas-wrap" style={{ position: "relative", maxHeight: "calc(100vh - 100px)", overflow: "auto", background: "#eee", borderRadius: 10, border: "1px solid #E8E8E4" }} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
                <div style={{ position: "sticky", top: 0, zIndex: 20, padding: "4px 6px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", background: "rgba(255,255,255,0.95)", borderRadius: 10, backdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", flexWrap: "nowrap", overflowX: "auto" }}>
                    {toolDefs.map(t => (<button key={t.k} onClick={() => { setTool(t.k); setTextPos(null); setPendingStamp(null); setMovingIdx(-1); }} title={t.l} style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: tool === t.k && !pendingStamp ? PRIMARY : "transparent", color: tool === t.k && !pendingStamp ? "#fff" : "#6B7280", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{t.ic}</button>))}
                    <div style={{ width: 1, height: 24, background: "#E0E0DC", margin: "0 3px", flexShrink: 0 }} />
                    <button onClick={undo} title="撤销" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16, flexShrink: 0 }}>↩</button>
                    <button onClick={redo} title="重做" style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", fontSize: 16, flexShrink: 0 }}>↪</button>
                    <div style={{ width: 1, height: 24, background: "#E0E0DC", margin: "0 3px", flexShrink: 0 }} />
                    {[RED, "#2980b9", "#333"].map(c => (<div key={c} onClick={() => setStrokeColor(c)} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: strokeColor === c ? "3px solid #333" : "2px solid #E0E0DC", flexShrink: 0 }} />))}
                    <input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} title="自定义颜色" style={{ width: 22, height: 22, border: "none", padding: 0, cursor: "pointer", borderRadius: 4, flexShrink: 0 }} />
                    <div style={{ width: 1, height: 24, background: "#E0E0DC", margin: "0 3px", flexShrink: 0 }} />
                    <input type="number" min={8} max={72} value={fontSize} onChange={e => { const v = Number(e.target.value); if (v >= 8 && v <= 72) { setFontSize(v); if (editIdx >= 0) { const acts = [...(actionMap[pk] || [])]; if (acts[editIdx]?.type === "text") { acts[editIdx] = { ...acts[editIdx], fontSize: v }; setActionMap(pr => ({ ...pr, [pk]: acts })); } } } }} style={{ width: 44, padding: "4px 2px", borderRadius: 6, border: "1px solid #E0E0DC", fontSize: 13, textAlign: "center", outline: "none", flexShrink: 0 }} title="字号" />
                    {([["left", <><rect key="1" x="0" y="1" width="16" height="2" rx="1" fill="currentColor"/><rect key="2" x="0" y="6" width="10" height="2" rx="1" fill="currentColor"/><rect key="3" x="0" y="11" width="14" height="2" rx="1" fill="currentColor"/></>],
                      ["center", <><rect key="1" x="0" y="1" width="16" height="2" rx="1" fill="currentColor"/><rect key="2" x="3" y="6" width="10" height="2" rx="1" fill="currentColor"/><rect key="3" x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/></>],
                      ["right", <><rect key="1" x="0" y="1" width="16" height="2" rx="1" fill="currentColor"/><rect key="2" x="6" y="6" width="10" height="2" rx="1" fill="currentColor"/><rect key="3" x="2" y="11" width="14" height="2" rx="1" fill="currentColor"/></>],
                      ["justify", <><rect key="1" x="0" y="1" width="16" height="2" rx="1" fill="currentColor"/><rect key="2" x="0" y="6" width="16" height="2" rx="1" fill="currentColor"/><rect key="3" x="0" y="11" width="16" height="2" rx="1" fill="currentColor"/></>]
                    ] as [typeof textAlign, React.ReactNode][]).map(([al, icon]) => (
                      <button key={al} onClick={() => { setTextAlign(al); if (editIdx >= 0) { const acts = [...(actionMap[pk] || [])]; if (acts[editIdx]?.type === "text") { acts[editIdx] = { ...acts[editIdx], textAlign: al }; setActionMap(pr => ({ ...pr, [pk]: acts })); } } }} style={{ width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer", background: textAlign === al ? PRIMARY_LIGHT : "transparent", color: textAlign === al ? PRIMARY : "#9CA3AF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">{icon}</svg>
                      </button>
                    ))}
                    <div style={{ width: 1, height: 24, background: "#E0E0DC", margin: "0 3px", flexShrink: 0 }} />
                    <button onClick={exportPNG} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #E0E0DC", cursor: "pointer", background: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>导出</button>
                    <button onClick={copyImageToClipboard} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #E0E0DC", cursor: "pointer", background: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>复制</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 10px", background: "rgba(255,255,255,0.95)", borderRadius: 10, backdropFilter: "blur(8px)", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    {QUICK_STAMPS.map((s, i) => (<button key={i} onClick={() => { setPendingStamp(s); setStrokeColor(s.color); setMovingIdx(-1); }} style={{ flex: "1 1 0", padding: "4px 1px", borderRadius: 5, border: pendingStamp?.label === s.label ? "2px solid " + s.color : "1px solid #E8E8E4", background: pendingStamp?.label === s.label ? s.color + "15" : "#fff", color: s.color, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</button>))}
                    {pendingStamp && <span style={{ fontSize: 10, color: "#9CA3AF", flexShrink: 0, whiteSpace: "nowrap" }}>← 放置</span>}
                    <div style={{ width: 1, height: 18, background: "#E0E0DC", margin: "0 1px", flexShrink: 0 }} />
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
                    {([["上", 0], ["下", 1], ["左", 2], ["右", 3]] as const).map(([label, idx]) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
                        <span style={{ fontSize: 9, color: "#9CA3AF", width: 12, textAlign: "center" }}>{label}</span>
                        <input type="range" min={0} max={600} step={10} value={pad[idx]} onChange={e => setPadVal(idx, Number(e.target.value))} style={{ width: 48, height: 14, cursor: "pointer", accentColor: pad[idx] > 0 ? PRIMARY : "#D1D5DB" }} />
                      </div>
                    ))}
                    {(padTop > 0 || padBot > 0 || padLeft > 0 || padRight > 0) && <button onClick={resetPad} style={{ padding: "1px 5px", borderRadius: 3, border: "1px solid #FECACA", background: "#FEF2F2", cursor: "pointer", fontSize: 10, color: RED, flexShrink: 0 }}>重置</button>}
                    </div>
                  </div>
                </div>
                {activeStudent.imageUrls[pageIndex] && <div style={{ position: "relative", background: "#fff", display: "block", width: "100%" }}>
                  {padTop > 0 && <div style={{ height: padTop, background: "#fff" }} />}
                  <div style={{ display: "flex" }}>{padLeft > 0 && <div style={{ width: padLeft, flexShrink: 0, background: "#fff" }} />}<img ref={imgRef} src={activeStudent.imageUrls[pageIndex]} alt="" style={{ maxWidth: "100%", width: "100%", display: "block" }} onLoad={syncCanvas} onDragStart={e => e.preventDefault()} />{padRight > 0 && <div style={{ width: padRight, flexShrink: 0, background: "#fff" }} />}</div>
                  {padBot > 0 && <div style={{ height: padBot, background: "#fff" }} />}
                  <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, cursor: movingIdx >= 0 ? "grabbing" : pendingStamp ? "copy" : tool === "hand" ? (handDragging ? "grabbing" : "grab") : tool === "text" ? "text" : tool === "eraser" ? "pointer" : tool === "penEraser" ? "crosshair" : "crosshair" }} onMouseDown={mDown} onMouseMove={mMove} onMouseUp={mUp} onDoubleClick={mDblClick} onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()} onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); redraw(); } if (handDragging) setHandDragging(false); setHoverIdx(-1); }} />
                  {movingIdx >= 0 && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(45,74,62,0.9)", color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, zIndex: 30, pointerEvents: "none" }}>移动中 · 单击放置 · Esc取消</div>}
                  {textPos && <textarea ref={txtRef} value={textVal} onChange={e => setTextVal(e.target.value)} onKeyDown={e => { if (e.key === "Escape") { setTextPos(null); setTextVal(""); setEditIdx(-1); } }} onBlur={() => setTimeout(() => commitText(), 80)} onContextMenu={e => e.stopPropagation()} style={{ position: "absolute", left: textPos.x, top: textPos.y - 4, fontSize, fontWeight: "bold", color: strokeColor, background: "rgba(255,255,255,0.92)", border: "2px solid " + strokeColor, borderRadius: 4, padding: "2px 6px", outline: "none", zIndex: 10, width: textBoxW, minWidth: 80, minHeight: fontSize * 1.4 + 12, lineHeight: 1.4, fontFamily: "'Noto Sans SC','Microsoft YaHei',sans-serif", resize: "both", overflow: "hidden", whiteSpace: "pre-wrap", wordBreak: "break-all", boxSizing: "border-box", textAlign }} />}
                </div>}
              </div>
              {activeStudent.imageUrls.length > 1 && <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "4px 0" }}><button disabled={pageIndex <= 0} onClick={() => setPageIndex(i => i - 1)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #E0E0DC", cursor: "pointer", background: "#fff", fontSize: 11 }}>← 上一页</button><span style={{ fontSize: 11, color: "#6B7280" }}>{"第 " + (pageIndex + 1) + " / " + activeStudent.imageUrls.length + " 页"}</span><button disabled={pageIndex >= activeStudent.imageUrls.length - 1} onClick={() => setPageIndex(i => i + 1)} style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #E0E0DC", cursor: "pointer", background: "#fff", fontSize: 11 }}>下一页 →</button></div>}
            </div>

            {!isMobile && <div
              onMouseDown={(e) => { e.preventDefault(); splitDragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
              style={{ width: 6, cursor: "col-resize", background: "#E0E0DC", flexShrink: 0, borderRadius: 3, transition: "background 0.15s", position: "relative", zIndex: 10 }}
              onMouseEnter={e => (e.currentTarget.style.background = PRIMARY_MID)}
              onMouseLeave={e => { if (!splitDragging.current) e.currentTarget.style.background = "#E0E0DC"; }}
            />}

            <div style={{ flex: 1, minWidth: 0, overflow: "auto", maxHeight: isMobile ? "none" : "calc(100vh - 100px)", padding: "0 12px" }}>
              {activeStudent.essayDetail ? <>
                <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: RED }}>逐段批注</h3>{(activeStudent.essayDetail.corrections || []).map((c: any, i: number) => (<div key={i} style={{ background: "#fff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #eee" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}><div style={{ flex: 1 }}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: c.type === "praise" ? GREEN : RED, color: "#fff" }}>{c.paragraph}{c.type === "praise" ? " +" : ""}</span><p style={{ fontSize: 13, margin: "4px 0 0", color: "#444" }}>{c.text}</p></div><button onClick={() => copyOneCorrection(c)} style={cpBtnS} title="复制批注">复制</button></div>{c.suggested && c.type !== "praise" && <div style={{ marginTop: 4, padding: "4px 10px", borderRadius: 5, background: "#edf9f1", borderLeft: "3px solid " + GREEN, fontSize: 13, color: GREEN, display: "flex", justifyContent: "space-between", alignItems: "center" }}>→ {c.suggested}<button onClick={() => copyOneSuggested(c)} style={{ ...cpBtnS, color: GREEN }} title="复制建议">复制</button></div>}</div>))}</div>
                {activeStudent.essayDetail.model_suggestions?.length > 0 && <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "#2980b9" }}>范文对比修改建议</h3>{activeStudent.essayDetail.model_suggestions.map((s: any, i: number) => (<div key={i} style={{ background: "#f0f8ff", borderRadius: 8, padding: 12, marginBottom: 8, border: "1px solid #b8d8f0" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "#2980b9", color: "#fff" }}>{s.paragraph}</span><button onClick={() => copyModelSuggestion(s)} style={cpBtnS} title="复制">复制</button></div><p style={{ fontSize: 12, margin: "6px 0 2px", color: "#888" }}>学生原句：<span style={{ color: "#555" }}>{s.student_text}</span></p><p style={{ fontSize: 12, margin: "2px 0", color: "#888" }}>范文参考：<span style={{ color: "#2980b9", fontWeight: 600 }}>{s.model_text}</span></p><p style={{ fontSize: 13, margin: "4px 0 0", color: "#444", lineHeight: 1.7 }}>{s.suggestion}</p></div>))}</div>}
                {activeStudent.essayDetail.good_phrases?.length > 0 && <div style={{ marginBottom: 16 }}><h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: RED }}>好词好句</h3><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{activeStudent.essayDetail.good_phrases.map((g: any, i: number) => (<span key={i} style={{ padding: "4px 12px", borderRadius: 20, background: g.type === "word" ? "#fef2f2" : "#fff8ed", border: "1px solid " + (g.type === "word" ? "#f0c0c0" : "#f0e0c0"), fontSize: 13, color: "#555" }}>{g.phrase} <span style={{ fontSize: 11, color: "#999" }}>{g.paragraph}</span></span>))}</div></div>}
                <div style={{ marginBottom: 16 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><h3 style={{ fontSize: 16, fontWeight: 700, color: GREEN, margin: 0 }}>三大亮点</h3><button onClick={copyAllHighlights} style={cpBtnS}>复制</button></div>{(activeStudent.essayDetail.highlights || []).map((h: any, i: number) => (<div key={i} style={{ background: "#edf9f1", borderRadius: 8, padding: 14, marginBottom: 8, borderLeft: "3px solid " + GREEN }}><p style={{ fontWeight: 700, fontSize: 14, color: GREEN, marginBottom: 4 }}>{(i + 1) + ". " + h.title}</p><p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#444" }}>{h.description}</p></div>))}</div>
                {activeStudent.essayDetail.special_req_feedback && <div style={{ background: "#fff0f6", borderRadius: 8, padding: 16, border: "1px solid #f0c0d8", marginBottom: 16 }}><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#b5453a" }}>特殊要求反馈</h3><p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: "#555" }}>{activeStudent.essayDetail.special_req_feedback}</p></div>}
                {activeStudent.essayDetail.teacher_comment && <div style={{ background: "#fff8ed", borderRadius: 8, padding: 16, border: "1px solid #f0e0c0", marginBottom: 16, position: "relative" }}><button onClick={copyTeacherComment} style={{ ...cpBtnS, position: "absolute", top: 12, right: 12 }}>复制</button><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>教师总评</h3><p style={{ fontSize: 14, lineHeight: 2, margin: 0, color: "#555" }}>{activeStudent.essayDetail.teacher_comment}</p></div>}
                {activeStudent.essayDetail.improvement_tips?.length > 0 && <div style={{ background: "#f0f4ff", borderRadius: 8, padding: 16, border: "1px solid #d0d8f0", position: "relative" }}><button onClick={copyAllTips} style={{ ...cpBtnS, position: "absolute", top: 12, right: 12 }}>复制</button><h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: PRIMARY }}>改进方向</h3>{activeStudent.essayDetail.improvement_tips.map((tip: string, i: number) => (<p key={i} style={{ fontSize: 13, lineHeight: 1.8, margin: "0 0 6px", color: "#444" }}>{tip}</p>))}</div>}
              </> : <p style={{ color: "#bbb", textAlign: "center", paddingTop: 40 }}>请先批改后查看</p>}
            </div>
            {!isMobile && <div style={{ width: 72, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, overflow: "auto", maxHeight: "calc(100vh - 100px)" }}>
              {students.filter(s => s.status === "done").map(s => (
                <button key={s.id} onClick={() => { setActiveStudentId(s.id); setPageIndex(0); }} title={s.name} style={{ width: 64, padding: "8px 4px", borderRadius: 8, border: activeStudentId === s.id ? "2px solid " + PRIMARY : "1px solid #E0E0DC", cursor: "pointer", background: activeStudentId === s.id ? PRIMARY_LIGHT : "#fff", color: activeStudentId === s.id ? PRIMARY : "#6B7280", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name.length > 3 ? s.name.slice(0, 3) : s.name}</button>
              ))}
            </div>}
          </div>}
        </div>}

        {tab === "archive" && <div>
          {!archiveDetailId ? <>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "#555" }}>储存箱 <span style={{ fontSize: 13, fontWeight: 400, color: "#999" }}>（学生作文档案）</span></h3>
          <div style={{ marginBottom: 16, position: "relative", maxWidth: 300 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="搜索学生…" style={{ width: "100%", padding: "7px 12px 7px 30px", borderRadius: 8, border: "1px solid #E0E0DC", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#D1D5DB", pointerEvents: "none" }}>🔍</span>
            {searchQuery && <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: 14 }}>✕</button>}
          </div>
          {students.filter(s => s.archived && (!searchQuery || s.name.includes(searchQuery))).length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#bbb" }}><p style={{ fontSize: 36 }}>—</p><p>{searchQuery ? "没有找到匹配的学生" : "储存箱是空的"}</p><p style={{ fontSize: 13 }}>批改完成的学生可以在列表里归档到这里</p></div>
          ) : (
            <div>
              {Array.from(new Set(students.filter(s => s.archived && (!searchQuery || s.name.includes(searchQuery))).map(s => s.className || "默认班"))).map(cn => {
                const classArchived = students.filter(s => s.archived && (s.className || "默认班") === cn && (!searchQuery || s.name.includes(searchQuery)));
                if (classArchived.length === 0) return null;
                const nameGroups: Record<string, typeof classArchived> = {};
                for (const s of classArchived) { if (!nameGroups[s.name]) nameGroups[s.name] = []; nameGroups[s.name].push(s); }
                return (<div key={cn} style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: PRIMARY, marginBottom: 10, borderBottom: "1px solid #eee", paddingBottom: 6 }}>{cn} <span style={{ fontSize: 12, fontWeight: 400, color: "#999" }}>({Object.keys(nameGroups).length}人)</span></h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                    {Object.entries(nameGroups).map(([name, stuList]) => {
                      const totalRecords = stuList.reduce((sum, s) => sum + (s.history?.length || 0), 0) || stuList.length;
                      const latestComment = stuList[stuList.length - 1]?.essayDetail?.teacher_comment;
                      return (<div key={name} onClick={() => setArchiveDetailId(name + "___" + cn)} style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: "14px 16px", cursor: "pointer", transition: "all 0.15s", display: "flex", flexDirection: "column", gap: 6 }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = PRIMARY_MID; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#eee"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{name}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: GREEN, color: "#fff" }}>{totalRecords} 次</span>
                        </div>
                        {latestComment && <p style={{ fontSize: 11, color: "#999", lineHeight: 1.5, margin: 0, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{latestComment.slice(0, 60)}</p>}
                        <span style={{ fontSize: 11, color: PRIMARY, fontWeight: 500 }}>查看档案 →</span>
                      </div>);
                    })}
                  </div>
                </div>);
              })}
            </div>
          )}
          </> : (() => {
            const [detailName, detailClass] = archiveDetailId.split("___");
            const detailStudents = students.filter(s => s.archived && s.name === detailName && (s.className || "默认班") === detailClass);
            const allHistory: { date: string; topic: string; grade: string; essayDetail: any; imageUrls: string[]; studentId: string; histIdx: number }[] = [];
            detailStudents.forEach(s => (s.history || []).forEach((h, hi) => allHistory.push({ ...h, studentId: s.id, histIdx: hi })));
            return <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <button onClick={() => { setArchiveDetailId(null); setArchiveHistOpen(false); }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #E0E0DC", background: "#fff", color: "#6B7280", fontSize: 12, cursor: "pointer" }}>← 返回</button>
                <div>
                  <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1F2937" }}>{detailName} 的作文档案</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9CA3AF" }}>{detailClass} · 共 {allHistory.length} 次批改记录</p>
                </div>
              </div>
              {detailStudents.map(s => s.essayDetail?.teacher_comment ? (
                <div key={s.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #eee", padding: 16, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>最近一次批改</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { unarchiveStudent(s.id); setActiveStudentId(s.id); setTab("detail"); setArchiveDetailId(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd", background: "#fff", color: "#666", fontSize: 11, cursor: "pointer" }}>查看详情</button>
                      <button onClick={() => { unarchiveStudent(s.id); setActiveStudentId(s.id); setCurrentClass(s.className || "默认班"); setTab("upload"); setArchiveDetailId(null); }} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid " + PRIMARY, background: "transparent", color: PRIMARY, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>取回</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: "#555", lineHeight: 1.8, margin: 0 }}>{s.essayDetail.teacher_comment}</p>
                  {s.essayDetail.highlights?.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    {s.essayDetail.highlights.map((h: any, i: number) => (<span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 12, background: GREEN + "15", color: GREEN, border: "1px solid " + GREEN + "33" }}>{h.title}</span>))}
                  </div>}
                </div>
              ) : null)}
              {/* Collapsible history */}
              {allHistory.length > 0 && <div style={{ borderRadius: 10, border: "1px solid #eee", overflow: "hidden" }}>
                <div onClick={() => setArchiveHistOpen(!archiveHistOpen)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#FAFAF8", cursor: "pointer", userSelect: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, transform: archiveHistOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", display: "inline-block" }}>▶</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#555" }}>历史记录</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>({allHistory.length}条)</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{archiveHistOpen ? "收起" : "展开"}</span>
                </div>
                {archiveHistOpen && <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {allHistory.map((h, i) => (
                    <div key={i} style={{ background: "#fff", borderRadius: 8, border: "1px solid #f0f0ee", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{h.date}</span>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: PRIMARY_LIGHT, color: PRIMARY }}>{h.grade} · {h.topic}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#D1D5DB" }}>#{allHistory.length - i}</span>
                          <button onClick={() => { if (confirm("删除这条历史记录？")) deleteHistoryRecord(h.studentId, h.histIdx); }} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #FECACA", background: "#FEF2F2", fontSize: 10, cursor: "pointer", color: RED }}>删除</button>
                        </div>
                      </div>
                      {h.essayDetail?.teacher_comment && <p style={{ fontSize: 12, color: "#666", lineHeight: 1.7, margin: 0 }}>{h.essayDetail.teacher_comment}</p>}
                      {h.essayDetail?.highlights?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {h.essayDetail.highlights.slice(0, 5).map((hl: any, hi: number) => (<span key={hi} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: GREEN + "12", color: GREEN }}>{hl.title}</span>))}
                      </div>}
                      {h.essayDetail?.improvement_tips?.length > 0 && <div style={{ fontSize: 11, color: "#999", lineHeight: 1.6 }}>改进：{h.essayDetail.improvement_tips.slice(0, 2).join("；")}</div>}
                    </div>
                  ))}
                </div>}
              </div>}
              {allHistory.length === 0 && <p style={{ textAlign: "center", color: "#D1D5DB", padding: "40px 0", fontSize: 13 }}>暂无历史批改记录</p>}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #eee" }}>
                <button onClick={() => { if (confirm("确定永久删除 " + detailName + " 的所有归档数据？")) { detailStudents.forEach(s => removeStudent(s.id)); setArchiveDetailId(null); } }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #f0c0c0", background: "#fef2f2", color: RED, fontSize: 12, cursor: "pointer" }}>删除该学生所有归档数据</button>
              </div>
            </div>;
          })()}
        </div>}
      </div>
    </div>
  );
}