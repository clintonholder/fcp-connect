import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ArrowUpRight, Square, Circle, Pen, Type, Undo2, Redo2, Trash2, X, Save, MousePointer2,
} from "lucide-react";

/** Normalized (0..1) coordinates so markup scales with any display size. */
export type Shape =
  | { id: string; kind: "arrow"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "rect"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "circle"; color: string; width: number; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "pen"; color: string; width: number; points: { x: number; y: number }[] }
  | { id: string; kind: "text"; color: string; width: number; x: number; y: number; text: string };

export type Tool = "select" | "arrow" | "rect" | "circle" | "pen" | "text";

export const MARKUP_COLORS = [
  { name: "Red", value: "#E53935" },
  { name: "Orange", value: "#FB8C00" },
  { name: "Yellow", value: "#FDD835" },
  { name: "Green", value: "#43A047" },
  { name: "Blue", value: "#1E88E5" },
  { name: "White", value: "#FFFFFF" },
  { name: "Black", value: "#111111" },
];

const STROKES = [
  { label: "Thin", value: 0.004 },
  { label: "Medium", value: 0.008 },
  { label: "Thick", value: 0.014 },
];

const uid = () => Math.random().toString(36).slice(2, 10);

/** Draw every shape onto a canvas context sized w x h pixels. */
export function drawShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], w: number, h: number) {
  const base = Math.max(w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of shapes) {
    const lw = Math.max(2, s.width * base);
    ctx.lineWidth = lw;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    // dark halo keeps light colors readable on bright photos
    const halo = () => { ctx.save(); ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = lw + Math.max(2, lw * 0.6); };
    if (s.kind === "arrow") {
      const x1 = s.x1 * w, y1 = s.y1 * h, x2 = s.x2 * w, y2 = s.y2 * h;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = Math.max(lw * 3.2, base * 0.02);
      const drawArrow = () => {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
        ctx.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
        ctx.closePath(); ctx.fill(); ctx.stroke();
      };
      halo(); ctx.fillStyle = "rgba(0,0,0,0.55)"; drawArrow(); ctx.restore();
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = lw; drawArrow();
    } else if (s.kind === "rect") {
      const x = Math.min(s.x1, s.x2) * w, y = Math.min(s.y1, s.y2) * h;
      const rw = Math.abs(s.x2 - s.x1) * w, rh = Math.abs(s.y2 - s.y1) * h;
      halo(); ctx.strokeRect(x, y, rw, rh); ctx.restore();
      ctx.lineWidth = lw; ctx.strokeStyle = s.color; ctx.strokeRect(x, y, rw, rh);
    } else if (s.kind === "circle") {
      const cx = ((s.x1 + s.x2) / 2) * w, cy = ((s.y1 + s.y2) / 2) * h;
      const rx = Math.abs(s.x2 - s.x1) * w / 2, ry = Math.abs(s.y2 - s.y1) * h / 2;
      const path = () => { ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2); ctx.stroke(); };
      halo(); path(); ctx.restore();
      ctx.lineWidth = lw; ctx.strokeStyle = s.color; path();
    } else if (s.kind === "pen") {
      const path = () => {
        ctx.beginPath();
        s.points.forEach((p, i) => (i ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
        ctx.stroke();
      };
      if (s.points.length > 1) { halo(); path(); ctx.restore(); ctx.lineWidth = lw; ctx.strokeStyle = s.color; path(); }
    } else if (s.kind === "text") {
      const fs = Math.max(12, s.width * base * 3.2);
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      ctx.textBaseline = "top";
      const pad = fs * 0.35;
      const tw = ctx.measureText(s.text).width;
      const x = s.x * w, y = s.y * h;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath();
      ctx.roundRect(x - pad, y - pad, tw + pad * 2, fs + pad * 2, pad);
      ctx.fill();
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, y);
    }
  }
}

function hitTest(s: Shape, x: number, y: number): boolean {
  const near = 0.03;
  if (s.kind === "pen") return s.points.some((p) => Math.abs(p.x - x) < near && Math.abs(p.y - y) < near);
  if (s.kind === "text") return x > s.x - near && x < s.x + near * 6 && y > s.y - near && y < s.y + near * 2;
  const minX = Math.min(s.x1, s.x2) - near, maxX = Math.max(s.x1, s.x2) + near;
  const minY = Math.min(s.y1, s.y2) - near, maxY = Math.max(s.y1, s.y2) + near;
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

function translate(s: Shape, dx: number, dy: number): Shape {
  if (s.kind === "pen") return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  if (s.kind === "text") return { ...s, x: s.x + dx, y: s.y + dy };
  return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
}

export function PhotoMarkupEditor({
  imageUrl, initialShapes, onCancel, onSave,
}: {
  imageUrl: string;
  initialShapes: Shape[];
  onCancel: () => void;
  onSave: (shapes: Shape[], blob: Blob | null) => Promise<void>;
}) {
  const [history, setHistory] = useState<Shape[][]>([initialShapes]);
  const [cursor, setCursor] = useState(0);
  const shapes = history[cursor];
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState(MARKUP_COLORS[0].value);
  const [stroke, setStroke] = useState(STROKES[1].value);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ start: { x: number; y: number }; id?: string } | null>(null);

  const commit = useCallback((next: Shape[]) => {
    setHistory((h) => [...h.slice(0, cursor + 1), next]);
    setCursor((c) => c + 1);
  }, [cursor]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.onerror = () => toast.error("Could not load this photo for markup");
    image.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (textPos) setTextPos(null); else onCancel(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !textPos) {
        commit(shapes.filter((s) => s.id !== selectedId)); setSelectedId(null);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) setCursor((c) => Math.min(history.length - 1, c + 1));
        else setCursor((c) => Math.max(0, c - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onCancel, selectedId, shapes, commit, textPos, history.length]);

  // Redraw the preview canvas
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !img) return;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const scale = Math.min(box.width / img.width, box.height / img.height);
    const w = Math.max(1, Math.floor(img.width * scale));
    const h = Math.max(1, Math.floor(img.height * scale));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.width = `${w}px`; cv.style.height = `${h}px`;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const all = draft ? [...shapes, draft] : shapes;
    drawShapes(ctx, all, w, h);
    const sel = all.find((s) => s.id === selectedId);
    if (sel) {
      ctx.save();
      ctx.strokeStyle = "#22D3EE"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      const xs = sel.kind === "pen" ? sel.points.map((p) => p.x) : sel.kind === "text" ? [sel.x, sel.x + 0.16] : [sel.x1, sel.x2];
      const ys = sel.kind === "pen" ? sel.points.map((p) => p.y) : sel.kind === "text" ? [sel.y, sel.y + 0.05] : [sel.y1, sel.y2];
      const x = Math.min(...xs) * w - 6, y = Math.min(...ys) * h - 6;
      ctx.strokeRect(x, y, (Math.max(...xs) - Math.min(...xs)) * w + 12, (Math.max(...ys) - Math.min(...ys)) * h + 12);
      ctx.restore();
    }
  }, [img, shapes, draft, selectedId]);

  const pos = (e: React.PointerEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const down = (e: React.PointerEvent) => {
    if (textPos) return;
    const p = pos(e);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      const hit = [...shapes].reverse().find((s) => hitTest(s, p.x, p.y));
      setSelectedId(hit?.id ?? null);
      if (hit) dragRef.current = { start: p, id: hit.id };
      return;
    }
    if (tool === "text") { setTextPos(p); setTextValue(""); return; }
    setSelectedId(null);
    dragRef.current = { start: p };
    if (tool === "pen") setDraft({ id: uid(), kind: "pen", color, width: stroke, points: [p] });
    else setDraft({ id: uid(), kind: tool, color, width: stroke, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const move = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pos(e);
    if (tool === "select" && d.id) {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      dragRef.current = { start: p, id: d.id };
      setHistory((h) => {
        const copy = [...h];
        copy[cursor] = copy[cursor].map((s) => (s.id === d.id ? translate(s, dx, dy) : s));
        return copy;
      });
      return;
    }
    setDraft((cur) => {
      if (!cur) return cur;
      if (cur.kind === "pen") return { ...cur, points: [...cur.points, p] };
      return { ...cur, x2: p.x, y2: p.y };
    });
  };

  const up = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (tool === "select") { if (d?.id) commit(shapes); return; }
    if (!draft) return;
    const big = draft.kind === "pen" ? draft.points.length > 2
      : draft.kind === "text" ? true
      : Math.abs(draft.x2 - draft.x1) > 0.01 || Math.abs(draft.y2 - draft.y1) > 0.01;

    if (big) commit([...shapes, draft]);
    setDraft(null);
  };

  const addText = () => {
    if (!textPos || !textValue.trim()) { setTextPos(null); return; }
    commit([...shapes, { id: uid(), kind: "text", color, width: stroke, x: textPos.x, y: textPos.y, text: textValue.trim() }]);
    setTextPos(null); setTextValue("");
  };

  const exportBlob = async (): Promise<Blob | null> => {
    if (!img) return null;
    if (!shapes.length) return null;
    const cv = document.createElement("canvas");
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    drawShapes(ctx, shapes, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b), "image/jpeg", 0.92));
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const blob = await exportBlob();
      await onSave(shapes, blob);
    } finally {
      setSaving(false);
    }
  };

  const tools: { key: Tool; icon: typeof Pen; label: string }[] = useMemo(() => [
    { key: "select", icon: MousePointer2, label: "Select & move" },
    { key: "arrow", icon: ArrowUpRight, label: "Arrow" },
    { key: "rect", icon: Square, label: "Box" },
    { key: "circle", icon: Circle, label: "Circle" },
    { key: "pen", icon: Pen, label: "Freehand pen" },
    { key: "text", icon: Type, label: "Text callout" },
  ], []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label="Photo markup editor">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" />Cancel
        </Button>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" aria-label="Undo"
            disabled={cursor === 0} onClick={() => { setSelectedId(null); setCursor((c) => Math.max(0, c - 1)); }}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" aria-label="Redo"
            disabled={cursor >= history.length - 1} onClick={() => setCursor((c) => Math.min(history.length - 1, c + 1))}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" aria-label="Delete selected"
            disabled={!selectedId} onClick={() => { commit(shapes.filter((s) => s.id !== selectedId)); setSelectedId(null); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10"
            disabled={!shapes.length} onClick={() => { commit([]); setSelectedId(null); }}>
            Clear all
          </Button>
        </div>
        <Button size="sm" onClick={doSave} disabled={saving || !img}>
          <Save className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative flex flex-1 items-center justify-center overflow-hidden p-2">
        {!img && <p className="text-sm text-white/70">Loading photo…</p>}
        <canvas
          ref={canvasRef}
          className="touch-none rounded"
          style={{ cursor: tool === "select" ? "move" : "crosshair", display: img ? "block" : "none" }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {textPos && (
          <div className="absolute inset-x-0 bottom-4 mx-auto flex w-[min(92%,26rem)] gap-2 rounded-lg bg-card p-2 shadow-xl">
            <Input autoFocus value={textValue} placeholder="Type a note…" aria-label="Callout text"
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addText(); } }} />
            <Button size="sm" onClick={addText} disabled={!textValue.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => setTextPos(null)}>Cancel</Button>
          </div>
        )}
      </div>

      {/* Tool bar */}
      <div className="space-y-2 border-t border-white/10 px-3 py-2">
        <div className="flex flex-wrap items-center justify-center gap-1">
          {tools.map((t) => (
            <Button key={t.key} size="sm" aria-label={t.label} title={t.label} aria-pressed={tool === t.key}
              variant={tool === t.key ? "default" : "ghost"}
              className={tool === t.key ? "" : "text-white hover:bg-white/10"}
              onClick={() => { setTool(t.key); setTextPos(null); }}>
              <t.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="flex items-center gap-1.5">
            {MARKUP_COLORS.map((c) => (
              <button key={c.value} type="button" aria-label={c.name} title={c.name} aria-pressed={color === c.value}
                onClick={() => {
                  setColor(c.value);
                  if (selectedId) commit(shapes.map((s) => (s.id === selectedId ? { ...s, color: c.value } : s)));
                }}
                className={`h-7 w-7 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-white ${color === c.value ? "border-white scale-110" : "border-white/30"}`}
                style={{ backgroundColor: c.value }} />
            ))}
          </div>
          <div className="flex items-center gap-1">
            {STROKES.map((s) => (
              <Button key={s.label} size="sm" aria-pressed={stroke === s.value}
                variant={stroke === s.value ? "secondary" : "ghost"}
                className={stroke === s.value ? "" : "text-white hover:bg-white/10"}
                onClick={() => {
                  setStroke(s.value);
                  if (selectedId) commit(shapes.map((x) => (x.id === selectedId ? { ...x, width: s.value } : x)));
                }}>
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
