import React, { useState } from "react";
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
import { BookOpen, Hand, Sparkles } from "lucide-react";

import WebcamCapture from "@/components/sign-language/WebcamCapture";
import LearningMode from "@/components/sign-language/LearningMode";
import RecognitionMode from "@/components/sign-language/RecognitionMode";
import SignList from "@/components/sign-language/SignList";

// React Query 키 상수
const SIGNS_QUERY_KEY = ['signs'];

/**
 * 하루키 수화 번역기 메인 앱 컴포넌트.
 * 웹캠 캡처, 실시간 인식, 학습 모드를 오케스트레이션한다.
 */
export default function SignLanguageApp() {
  // 학습 모드 다이얼로그 표시 여부
  const [showLearningMode, setShowLearningMode] = useState(false);
  // 웹캠에서 감지된 최신 랜드마크
  const [currentLandmarks, setCurrentLandmarks] = useState(null);

  const queryClient = useQueryClient();

  // 저장된 수화 목록 조회
  const { data: signs = [], isLoading, error } = useQuery({
    queryKey: SIGNS_QUERY_KEY,
    queryFn: async () => {
      const data = await base44.entities.SignLanguage.list('-created_at');
      return data;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0,
    retry: 2,
  });

  // 수화 삭제 뮤테이션
  const deleteMutation = useMutation({
    mutationFn: (id: string) => base44.entities.SignLanguage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SIGNS_QUERY_KEY });
    },
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

        {/* 우측: 학습된 수화 수 + 학습하기 버튼 */}
        <div className="flex items-center gap-3">
          {signs.length > 0 && (
            <span className="text-xs text-white/40 font-medium">
              학습 {signs.length}개
            </span>
          )}
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
              <LearningMode signs={signs} />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* 웹캠 + 인식 패널 (70/30 분할) */}
        <div className="flex flex-1 gap-0 overflow-hidden min-h-0">

          {/* 왼쪽: 웹캠 (70%) */}
          <div className="flex-[7] min-w-0 p-4 pr-2">
            <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl shadow-black/50">
              <WebcamCapture
                onLandmarksDetected={setCurrentLandmarks}
                showLandmarks={true}
              />
            </div>
          </div>

          {/* 오른쪽: 인식 패널 (30%) */}
          <div className="flex-[3] min-w-0 p-4 pl-2 flex flex-col min-h-0">
            <RecognitionMode
              currentLandmarks={currentLandmarks}
              signs={signs}
            />
          </div>
        </div>

        {/* ── 하단: 저장된 수화 가로 스크롤 ── */}
        <div className="shrink-0 border-t border-white/5 bg-black/30 backdrop-blur-sm">
          <SignList
            signs={signs}
            isLoading={isLoading}
            error={error as Error | null}
            deleteMutation={deleteMutation}
          />
        </div>
      </main>
    </div>
  );
}
