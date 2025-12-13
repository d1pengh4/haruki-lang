import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Trash2, Hand } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import WebcamCapture from "@/components/sign-language/WebcamCapture";
import LearningMode from "@/components/sign-language/LearningMode";
import RecognitionMode from "@/components/sign-language/RecognitionMode";

export default function SignLanguageApp() {
  const [showLearningMode, setShowLearningMode] = useState(false);
  const [currentLandmarks, setCurrentLandmarks] = useState(null);
  const queryClient = useQueryClient();

  const { data: signs = [], isLoading, error } = useQuery({
    queryKey: ['signs'],
    queryFn: async () => {
      console.log('수화 데이터 로딩 시작...');
      const data = await base44.entities.SignLanguage.list('-created_at');
      console.log('수화 데이터 로딩 완료:', data.length, '개');
      return data;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0, // 항상 최신 데이터 가져오기
    retry: 2,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => base44.entities.SignLanguage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signs'] });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Hand className="w-9 h-9 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            한국 수화 번역기
          </h1>
          <p className="text-gray-600 text-lg">
            실시간 수화 인식 및 문장 생성
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <WebcamCapture 
                onLandmarksDetected={setCurrentLandmarks}
                showLandmarks={true}
              />
            </div>
            <div>
              <RecognitionMode 
                currentLandmarks={currentLandmarks}
                signs={signs}
              />
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <Dialog open={showLearningMode} onOpenChange={setShowLearningMode}>
              <DialogTrigger asChild>
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg"
                >
                  <BookOpen className="w-5 h-5 mr-2" />
                  수화 학습하기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-2xl">
                    <Hand className="w-6 h-6" />
                    학습 모드
                  </DialogTitle>
                </DialogHeader>
                <LearningMode signs={signs} />
              </DialogContent>
            </Dialog>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hand className="w-5 h-5" />
                저장된 수화 ({signs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-gray-500">
                  <Hand className="w-16 h-16 mx-auto mb-4 opacity-30 animate-pulse" />
                  <p>수화 데이터를 불러오는 중...</p>
                </div>
              ) : error ? (
                <div className="text-center py-12 text-red-500">
                  <Hand className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>데이터를 불러오는 중 오류가 발생했습니다.</p>
                  <p className="text-sm mt-2">{error.message}</p>
                </div>
              ) : signs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Hand className="w-16 h-16 mx-auto mb-4 opacity-30" />
                  <p>아직 저장된 수화가 없습니다.</p>
                  <p className="text-sm mt-2">학습 모드에서 새로운 수화를 추가해보세요!</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {signs.map((sign) => (
                    <div
                      key={sign.id}
                      className="group relative bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-400 transition-all overflow-hidden"
                    >
                      {sign.thumbnail ? (
                        <img
                          src={sign.thumbnail}
                          alt={sign.name}
                          className="w-full aspect-square object-cover"
                        />
                      ) : (
                        <div className="w-full aspect-square bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                          <Hand className="w-12 h-12 text-indigo-400" />
                        </div>
                      )}
                      <div className="p-3">
                        <p className="font-semibold text-center truncate">{sign.name}</p>
                        {sign.duration && (
                          <p className="text-xs text-gray-500 text-center mt-1">
                            {sign.duration.toFixed(1)}초
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-2 right-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteMutation.mutate(sign.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}