import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookOpen, Hand, Mic, Sparkles } from "lucide-react";

import WebcamCapture from "@/components/sign-language/WebcamCapture";
import LearningMode from "@/components/sign-language/LearningMode";
import RecognitionMode from "@/components/sign-language/RecognitionMode";
import SignList from "@/components/sign-language/SignList";
import VoiceMode from "@/components/sign-language/VoiceMode";

// React Query 키 상수
const SIGNS_META_KEY = ['signs-meta'];   // 경량 메타 (목록 표시용)
const SIGNS_FULL_KEY = ['signs-full'];   // 전체 데이터 (인식용)

/**
 * 하루키 수화 번역기 메인 앱 컴포넌트.
 * 웹캠 캡처, 실시간 인식, 학습 모드를 오케스트레이션한다.
 */
export default function SignLanguageApp() {
  // 앱 모드: 수화 인식 또는 음성 텍스트 변환
  const [appMode, setAppMode] = useState<'sign' | 'voice'>('sign');
  // 학습 모드 다이얼로그 표시 여부
  const [showLearningMode, setShowLearningMode] = useState(false);
  // 웹캠에서 감지된 최신 랜드마크
  const [currentLandmarks, setCurrentLandmarks] = useState(null);

  const queryClient = useQueryClient();

  // [빠름] 메타 쿼리: landmarks_sequence 제외 — SignList 표시 및 헤더 카운트용
  const { data: signsMeta = [], isLoading, error } = useQuery({
    queryKey: SIGNS_META_KEY,
    queryFn: () => base44.entities.SignLanguage.listMeta('-created_at'),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
    retry: 2,
  });

  // [느림] 전체 쿼리: landmarks_sequence 포함 — RecognitionMode DTW 매칭용
  const { data: signsForRecognition = [] } = useQuery({
    queryKey: SIGNS_FULL_KEY,
    queryFn: () => base44.entities.SignLanguage.list('-created_at'),
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
    retry: 2,
  });

  // 이름 기준 중복 제거 — SignList 칩 표시용
  const uniqueSignsMeta = useMemo(
    () => Array.from(new Map(signsMeta.map(s => [s.name, s])).values()),
    [signsMeta]
  );

  // 양쪽 캐시 무효화 헬퍼
  const invalidateSigns = () => {
    queryClient.invalidateQueries({ queryKey: SIGNS_META_KEY });
    queryClient.invalidateQueries({ queryKey: SIGNS_FULL_KEY });
  };

  // 이름으로 수화 전체 삭제 (같은 이름 중복 항목 모두 포함)
  const deleteByNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const toDelete = signsMeta.filter(s => s.name === name);
      await Promise.all(toDelete.map(s => base44.entities.SignLanguage.delete(s.id)));
    },
    onSuccess: invalidateSigns,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-slate-950 to-slate-900 text-white flex flex-col">

      {/* ── 헤더 ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-black/40 backdrop-blur-sm shrink-0">
        {/* 로고 + 타이틀 */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Hand className="w-5 h-5 text-white" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-bold text-white tracking-tight">하루키</span>
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          </div>
        </div>

        {/* 중앙: 모드 전환 토글 */}
        <div className="flex items-center bg-white/5 rounded-xl p-1 gap-1">
          <button
            onClick={() => setAppMode('sign')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              appMode === 'sign'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            수화 모드
          </button>
          <button
            onClick={() => setAppMode('voice')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              appMode === 'voice'
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            음성 모드
          </button>
        </div>

        {/* 우측: 학습된 수화 수 + 학습하기 버튼 (수화 모드에서만 표시) */}
        <div className="flex items-center gap-3">
          {appMode === 'sign' && uniqueSignsMeta.length > 0 && (
            <span className="text-xs text-white/40 font-medium">
              학습 {uniqueSignsMeta.length}개
            </span>
          )}
          {appMode === 'sign' && (
            <Dialog open={showLearningMode} onOpenChange={setShowLearningMode}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/30 border-0 gap-1.5"
                >
                  <BookOpen className="w-4 h-4" />
                  수화 학습하기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-slate-900 border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl text-white">
                    <Hand className="w-5 h-5" />
                    학습 모드
                  </DialogTitle>
                </DialogHeader>
                <LearningMode signs={signsMeta} onSaved={invalidateSigns} />
              </DialogContent>
            </Dialog>
          )}
          {appMode === 'voice' && (
            <span className="text-xs text-white/25 font-medium w-[120px]" />
          )}
        </div>
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {appMode === 'voice' ? (
          <VoiceMode />
        ) : (
          <>
            {/* 웹캠 + 인식 패널 (70/30 분할) */}
            <div className="flex flex-1 gap-0 overflow-hidden min-h-0">

              {/* 왼쪽: 웹캠 (70%) — 학습 모드 다이얼로그가 열리면 pause */}
              <div className="flex-[7] min-w-0 p-4 pr-2">
                <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
                  <WebcamCapture
                    onLandmarksDetected={setCurrentLandmarks}
                    showLandmarks={true}
                    paused={showLearningMode}
                  />
                </div>
              </div>

              {/* 오른쪽: 인식 패널 (30%) */}
              <div className="flex-[3] min-w-0 p-4 pl-2 flex flex-col min-h-0">
                <RecognitionMode
                  currentLandmarks={currentLandmarks}
                  signs={signsForRecognition}
                />
              </div>
            </div>

            {/* ── 하단: 저장된 수화 가로 스크롤 ── */}
            <div className="shrink-0 border-t border-white/5 bg-black/30 backdrop-blur-sm">
              <SignList
                signs={uniqueSignsMeta}
                isLoading={isLoading}
                error={error as Error | null}
                onDeleteSign={(name) => deleteByNameMutation.mutate(name)}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
