import React, { useState } from 'react';
import { Hand, Search, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { SignMeta } from '@/lib/supabaseClient';

interface SignListProps {
  signs: SignMeta[];         // 이름 기준 중복 제거된 목록 (부모에서 처리)
  isLoading: boolean;
  error: Error | null;
  onDeleteSign: (name: string) => void;
}

// 개별 수화 chip — 2단계 삭제 확인
const SignChip = ({ sign, onDeleteSign }: { sign: SignMeta; onDeleteSign: (name: string) => void }) => {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group flex items-center gap-1.5 pl-2 pr-1 py-1 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] hover:border-white/[0.16] rounded-full transition-all duration-150 shrink-0">
      {/* 썸네일 또는 아이콘 */}
      {sign.thumbnail ? (
        <img
          src={sign.thumbnail}
          alt={sign.name}
          className="w-6 h-6 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 flex items-center justify-center shrink-0">
          <Hand className="w-3 h-3 text-white/50" />
        </div>
      )}
      {/* 이름 */}
      <span className="text-xs text-white/60 font-medium whitespace-nowrap">{sign.name}</span>
      {/* 삭제: 1차 클릭 → 확인 상태, 2차 클릭 → 삭제 */}
      {confirming ? (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => { onDeleteSign(sign.name); setConfirming(false); }}
            title="삭제 확인"
            className="w-5 h-5 rounded-full flex items-center justify-center bg-red-500/20 hover:bg-red-500/40 transition-colors shrink-0"
          >
            <Check className="w-3 h-3 text-red-400" />
          </button>
          <button
            onClick={() => setConfirming(false)}
            title="취소"
            className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-3 h-3 text-white/40" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          title="삭제"
          className="w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all duration-150 shrink-0"
        >
          <X className="w-3 h-3 text-red-400" />
        </button>
      )}
    </div>
  );
};

export default function SignList({ signs, isLoading, error, onDeleteSign }: SignListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // 검색어로 필터링
  const filteredSigns = signs.filter(sign =>
    sign.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2 h-12">
      {/* 좌측: 검색창 (compact) */}
      <div className="relative shrink-0 w-32">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20 pointer-events-none" />
        <Input
          placeholder="검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-6 pr-3 h-7 text-[11px] bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-full focus:border-white/20 focus:ring-0"
        />
      </div>

      {/* 구분선 */}
      <div className="w-px h-4 bg-white/[0.08] shrink-0" />

      {/* 수화 chip 가로 스크롤 */}
      <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
        {isLoading ? (
          /* 로딩 상태: 스켈레톤 pill */
          <div className="flex items-center gap-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-8 rounded-full bg-white/5 animate-pulse shrink-0"
                style={{ width: `${60 + i * 15}px` }}
              />
            ))}
          </div>
        ) : error ? (
          <span className="text-red-400/70 text-xs">데이터를 불러올 수 없습니다</span>
        ) : signs.length === 0 ? (
          <span className="text-white/20 text-xs">학습된 수화가 없습니다. 학습 모드에서 추가해보세요.</span>
        ) : filteredSigns.length === 0 ? (
          <span className="text-white/20 text-xs">"{searchQuery}" 검색 결과 없음</span>
        ) : (
          <div className="flex items-center gap-2">
            {filteredSigns.map((sign) => (
              <SignChip key={sign.id} sign={sign} onDeleteSign={onDeleteSign} />
            ))}
          </div>
        )}
      </div>

      {/* 우측: 수화 개수 표시 */}
      {signs.length > 0 && (
        <span className="text-[11px] text-white/25 shrink-0 font-mono">
          {filteredSigns.length}/{signs.length}
        </span>
      )}
    </div>
  );
}
