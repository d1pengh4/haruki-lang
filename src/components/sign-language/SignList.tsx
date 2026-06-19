import React, { useState, useRef, useEffect } from 'react';
import { Hand, Search, Check, X, Download, Upload, Loader2, Play, Pause } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import type { SignMeta, SignLanguage, LandmarkFrame } from '@/lib/supabaseClient';
import { getSignSequences } from '@/lib/supabaseClient';

// ── 스켈레톤 연결선 상수 ──────────────────────────────────────────
const POSE_CONNS: [number, number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];
const HAND_CONNS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20],
];

// ── 캔버스 프레임 드로잉 ─────────────────────────────────────────
function drawFrame(canvas: HTMLCanvasElement, frame: LandmarkFrame) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = '#060d1a';
  ctx.fillRect(0, 0, W, H);

  const lines = (pts: {x:number;y:number}[] | null, conns: [number,number][], color: string, lw: number) => {
    if (!pts) return;
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    for (const [a, b] of conns) {
      const p1 = pts[a], p2 = pts[b];
      if (!p1 || !p2) continue;
      ctx.beginPath(); ctx.moveTo(p1.x*W, p1.y*H); ctx.lineTo(p2.x*W, p2.y*H); ctx.stroke();
    }
  };
  const dots = (pts: {x:number;y:number}[] | null, color: string, r: number, ids?: number[]) => {
    if (!pts) return;
    ctx.fillStyle = color;
    const src = ids ? ids.map(i => pts[i]).filter(Boolean) : pts;
    for (const p of src) { ctx.beginPath(); ctx.arc(p.x*W, p.y*H, r, 0, Math.PI*2); ctx.fill(); }
  };

  lines(frame.pose,       POSE_CONNS, 'rgba(148,163,184,0.35)', 1.5);
  dots (frame.pose,       'rgba(129,140,248,0.85)', 3, [0,11,12,13,14,15,16]);
  lines(frame.left_hand,  HAND_CONNS, 'rgba(34,211,238,0.7)',   1.5);
  dots (frame.left_hand,  'rgba(6,182,212,1)',   3);
  lines(frame.right_hand, HAND_CONNS, 'rgba(167,139,250,0.7)',  1.5);
  dots (frame.right_hand, 'rgba(139,92,246,1)',  3);
}

// ── 미리보기 다이얼로그 ───────────────────────────────────────────
function SignPreviewDialog({ sign, onClose }: { sign: SignMeta | null; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const [loading,   setLoading]   = useState(false);
  const [signData,  setSignData]  = useState<SignLanguage | null>(null);
  const [playing,   setPlaying]   = useState(true);

  // 수화 데이터 로드
  useEffect(() => {
    if (!sign) { setSignData(null); return; }
    setLoading(true); setSignData(null); setPlaying(true);
    base44.entities.SignLanguage.get(sign.id)
      .then(d => setSignData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sign?.id]);

  // 캔버스 애니메이션
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    if (!signData || !canvasRef.current || !playing) return;

    // 원본 랜드마크가 있는 첫 번째 시퀀스 사용
    const seqs = getSignSequences(signData);
    const seq  = seqs.find(s => s.some(f => f.pose || f.left_hand || f.right_hand));
    if (!seq?.length) return;

    let fi = 0, last = 0;
    const INTERVAL = 1000 / 15; // 15fps

    const loop = (t: number) => {
      if (t - last >= INTERVAL) {
        if (canvasRef.current) drawFrame(canvasRef.current, seq[fi % seq.length]);
        fi++; last = t;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [signData, playing]);

  const seqCount = signData ? getSignSequences(signData).length : 0;

  return (
    <Dialog open={!!sign} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-xs p-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Hand className="w-3.5 h-3.5 text-violet-400" />
            {sign?.name}
          </DialogTitle>
        </DialogHeader>

        {/* 캔버스 영역 */}
        <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#060d1a]" style={{ aspectRatio: '4/3' }}>
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
            </div>
          ) : !signData ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white/20 text-xs">불러올 수 없습니다</p>
            </div>
          ) : (
            <>
              {/* WebcamCapture와 동일하게 -scale-x-100으로 미러링 */}
              <canvas ref={canvasRef} width={640} height={480} className="w-full h-full -scale-x-100" />
              {/* 재생/정지 버튼 */}
              <button
                onClick={() => setPlaying(p => !p)}
                className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-black/60 border border-white/10 flex items-center justify-center hover:bg-black/80 transition-colors"
              >
                {playing
                  ? <Pause className="w-2.5 h-2.5 text-white/50" />
                  : <Play  className="w-2.5 h-2.5 text-white/50" />
                }
              </button>
            </>
          )}
        </div>

        {signData && (
          <p className="text-[10px] text-white/25 text-center">
            {seqCount}개 시퀀스 · {sign?.duration?.toFixed(1)}초
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sign Chip ─────────────────────────────────────────────────────
interface SignChipProps {
  sign: SignMeta;
  onDeleteSign: (name: string) => void;
  onPreview: (sign: SignMeta) => void;
}

const SignChip = ({ sign, onDeleteSign, onPreview }: SignChipProps) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      onClick={() => !confirming && onPreview(sign)}
      className="group flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/[0.16] rounded-full transition-all duration-150 shrink-0 cursor-pointer"
    >
      {sign.thumbnail ? (
        <img src={sign.thumbnail} alt={sign.name} className="w-5 h-5 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
          <Hand className="w-2.5 h-2.5 text-white/40" />
        </div>
      )}
      <span className="text-xs text-white/60 font-medium whitespace-nowrap">{sign.name}</span>

      {confirming ? (
        <div className="flex items-center gap-0.5">
          <button
            onClick={e => { e.stopPropagation(); onDeleteSign(sign.name); setConfirming(false); }}
            className="w-5 h-5 rounded-full flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 transition-colors shrink-0"
          >
            <Check className="w-3 h-3 text-red-400" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setConfirming(false); }}
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-3 h-3 text-white/40" />
          </button>
        </div>
      ) : (
        <button
          onClick={e => { e.stopPropagation(); setConfirming(true); }}
          className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all duration-150 shrink-0"
        >
          <X className="w-3 h-3 text-red-400" />
        </button>
      )}
    </div>
  );
};

// ── SignList ──────────────────────────────────────────────────────
interface SignListProps {
  signs: SignMeta[];
  isLoading: boolean;
  error: Error | null;
  onDeleteSign: (name: string) => void;
  onImported?: () => void;
}

export default function SignList({ signs, isLoading, error, onDeleteSign, onImported }: SignListProps) {
  const [searchQuery,  setSearchQuery]  = useState('');
  const [previewSign,  setPreviewSign]  = useState<SignMeta | null>(null);
  const [importing,    setImporting]    = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const filteredSigns = signs.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 내보내기: 전체 수화 데이터 JSON 다운로드
  const handleExport = async () => {
    try {
      const allSigns = await base44.entities.SignLanguage.list('-created_at');
      const blob = new Blob([JSON.stringify(allSigns, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `haruki-signs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) { console.error('내보내기 실패:', e); }
  };

  // 가져오기: JSON 파일 → Supabase 순차 저장
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const text = await file.text();
      const imported = JSON.parse(text) as any[];
      for (const sign of imported) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, created_at, updated_at, ...payload } = sign;
        await base44.entities.SignLanguage.create(payload);
      }
      onImported?.();
    } catch (e) { console.error('가져오기 실패:', e); }
    finally { setImporting(false); }
  };

  return (
    <>
      <SignPreviewDialog sign={previewSign} onClose={() => setPreviewSign(null)} />

      <div className="flex items-center gap-2 px-4 py-2 h-12">
        {/* 검색창 */}
        <div className="relative shrink-0 w-32">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20 pointer-events-none" />
          <Input
            placeholder="검색..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-6 pr-3 h-7 text-[11px] bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-full focus:border-white/20 focus:ring-0"
          />
        </div>

        <div className="w-px h-4 bg-white/[0.08] shrink-0" />

        {/* 수화 chip 목록 */}
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {isLoading ? (
            <div className="flex items-center gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-7 rounded-full bg-white/5 animate-pulse shrink-0" style={{ width: `${60 + i * 15}px` }} />
              ))}
            </div>
          ) : error ? (
            <span className="text-red-400/70 text-xs">데이터를 불러올 수 없습니다</span>
          ) : signs.length === 0 ? (
            <span className="text-white/20 text-xs">학습된 수화가 없습니다. 학습 모드에서 추가해보세요.</span>
          ) : filteredSigns.length === 0 ? (
            <span className="text-white/20 text-xs">"{searchQuery}" 검색 결과 없음</span>
          ) : (
            <div className="flex items-center gap-1.5">
              {filteredSigns.map(sign => (
                <SignChip key={sign.id} sign={sign} onDeleteSign={onDeleteSign} onPreview={setPreviewSign} />
              ))}
            </div>
          )}
        </div>

        {/* 카운트 */}
        {signs.length > 0 && (
          <span className="text-[11px] text-white/20 shrink-0 font-mono">
            {filteredSigns.length}/{signs.length}
          </span>
        )}

        <div className="w-px h-4 bg-white/[0.08] shrink-0" />

        {/* 내보내기 */}
        <button
          onClick={handleExport}
          title="수화 데이터 내보내기 (.json)"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/5 transition-all shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
        </button>

        {/* 가져오기 */}
        <button
          onClick={() => importInputRef.current?.click()}
          title="수화 데이터 가져오기 (.json)"
          disabled={importing}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/5 transition-all shrink-0 disabled:opacity-40"
        >
          {importing
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload  className="w-3.5 h-3.5" />
          }
        </button>
        <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      </div>
    </>
  );
}
