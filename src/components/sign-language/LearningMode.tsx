import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Hand, CheckCircle2, AlertCircle, Circle, StopCircle, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import WebcamCapture from "@/components/sign-language/WebcamCapture";
import type { SignLanguage, LandmarksDetected, LandmarkFrame, MultiSequenceData } from '@/lib/supabaseClient';
import { trimSilence, flipSequence } from '@/lib/featureExtraction';

interface LearningModeProps {
  signs: SignLanguage[];
}

interface TakeInfo {
  frames: LandmarkFrame[];
  handDetectionRate: number;
  durationSec: number;
}

const MAX_TAKES = 3;
const MAX_RECORD_SEC = 6;

// 테이크 품질 점수 계산 (0~100)
function calcQuality(take: TakeInfo): number {
  const detectionScore = take.handDetectionRate * 0.6;
  const lengthScore = Math.min(1, take.durationSec / 2) * 40; // 2초 이상이면 만점
  return Math.min(100, detectionScore + lengthScore);
}

export default function LearningMode({ signs }: LearningModeProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 녹화 상태
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimeSec, setRecordingTimeSec] = useState(0);
  const [currentLandmarks, setCurrentLandmarks] = useState<LandmarksDetected | null>(null);

  // 테이크 목록
  const [takes, setTakes] = useState<TakeInfo[]>([]);

  const recordingFramesRef = useRef<LandmarkFrame[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statusTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // status를 세팅하고 지정 시간 후 자동 클리어 (이전 타이머는 취소)
  const setStatusTimed = useCallback((s: { type: 'success' | 'error'; message: string }, ms = 3000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(s);
    statusTimerRef.current = setTimeout(() => setStatus(null), ms);
  }, []);

  // 언마운트 시 타이머 정리
  useEffect(() => () => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }, []);

  // 같은 이름의 기존 수화 찾기
  const existingSign = signs.find(s => s.name === name.trim());

  // ---------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: ({ payload, existingId }: {
      payload: Omit<SignLanguage, 'id' | 'created_at' | 'updated_at'>;
      existingId?: string;
    }) =>
      existingId
        ? base44.entities.SignLanguage.update(existingId, payload)
        : base44.entities.SignLanguage.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signs'] });
      const msg = existingSign ? '기존 수화를 업데이트했습니다!' : '수화가 저장되었습니다!';
      setStatusTimed({ type: 'success', message: msg });
      setName('');
      setTakes([]);
      setRecordingTimeSec(0);
    },
    onError: () => {
      setStatusTimed({ type: 'error', message: '저장 중 오류가 발생했습니다.' });
    },
  });

  // ---------------------------------------------------------------
  // 카운트다운 → 자동 녹화 시작
  // ---------------------------------------------------------------
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      startRecordingNow();
      return;
    }
    const timer = setTimeout(() => setCountdown(prev => (prev ?? 1) - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // ---------------------------------------------------------------
  // 녹화 함수 (프레임 수집 useEffect보다 먼저 선언 — forward reference 방지)
  // ---------------------------------------------------------------
  const startRecordingNow = useCallback(() => {
    recordingFramesRef.current = [];
    startTimeRef.current = Date.now();
    setRecordingTimeSec(0);
    setIsRecording(true);

    recordingTimerRef.current = setInterval(() => {
      setRecordingTimeSec(prev => prev + 0.1);
    }, 100);
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const rawFrames = [...recordingFramesRef.current];
    if (rawFrames.length < 5) {
      setStatusTimed({ type: 'error', message: '녹화 시간이 너무 짧습니다. 다시 시도해주세요.' });
      return;
    }

    // Silence trimming 후 품질 검사
    const trimmed = trimSilence(rawFrames);
    const framesWithHand = trimmed.filter(
      f => f.left_hand_features !== null || f.right_hand_features !== null
    ).length;
    const handDetectionRate = trimmed.length > 0 ? (framesWithHand / trimmed.length) * 100 : 0;
    const durationSec = trimmed[trimmed.length - 1].timestamp / 1000;

    if (handDetectionRate < 40) {
      setStatusTimed({ type: 'error', message: `손 감지율이 너무 낮습니다 (${handDetectionRate.toFixed(0)}%). 손이 카메라에 잘 보이도록 해주세요.` }, 4000);
      return;
    }

    setTakes(prev => [...prev, { frames: trimmed, handDetectionRate, durationSec }]);
  }, [isRecording]);

  // ---------------------------------------------------------------
  // 프레임 수집 (녹화 중에만)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!isRecording || !currentLandmarks || !startTimeRef.current) return;

    const timestamp = Date.now() - startTimeRef.current;
    const frame: LandmarkFrame = {
      timestamp,
      pose: currentLandmarks.pose ?? null,
      left_hand: currentLandmarks.leftHand ?? null,
      right_hand: currentLandmarks.rightHand ?? null,
      face: currentLandmarks.face ?? null,
      left_hand_features: currentLandmarks.leftHandFeatures ?? null,
      right_hand_features: currentLandmarks.rightHandFeatures ?? null,
      pose_features: currentLandmarks.poseFeatures ?? null,
    };
    recordingFramesRef.current.push(frame);

    // 최대 녹화 시간 초과 시 자동 중지
    if (timestamp / 1000 >= MAX_RECORD_SEC) {
      stopRecording();
    }
  }, [currentLandmarks, isRecording, stopRecording]);

  const prepareRecording = () => {
    if (!currentLandmarks || (!currentLandmarks.pose && !currentLandmarks.leftHand && !currentLandmarks.rightHand)) {
      setStatusTimed({ type: 'error', message: '신체가 감지되지 않았습니다. 카메라 앞에 서주세요.' });
      return;
    }
    if (takes.length >= MAX_TAKES) {
      setStatusTimed({ type: 'error', message: `최대 ${MAX_TAKES}번까지만 녹화할 수 있습니다.` }, 2000);
      return;
    }
    setCountdown(3);
  };

  const cancelCountdown = () => setCountdown(null);

  const deleteTake = (index: number) => {
    setTakes(prev => prev.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------
  // 저장 처리
  // ---------------------------------------------------------------
  const handleSave = () => {
    if (!name.trim()) {
      setStatusTimed({ type: 'error', message: '수화 이름을 입력해주세요.' });
      return;
    }
    if (takes.length === 0) {
      setStatusTimed({ type: 'error', message: '먼저 동작을 녹화해주세요.' });
      return;
    }

    // 각 테이크에 좌우반전 증강 추가
    const allSequences: LandmarkFrame[][] = [];
    for (const take of takes) {
      allSequences.push(take.frames);
      allSequences.push(flipSequence(take.frames));
    }

    const bestTake = takes.reduce((best, t) => calcQuality(t) > calcQuality(best) ? t : best);
    const duration = bestTake.durationSec;

    // 썸네일 캡처
    let thumbnail: string | null = null;
    try {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      if (canvas) thumbnail = canvas.toDataURL('image/jpeg', 0.6);
    } catch (e) { console.warn('썸네일 캡처 실패:', e); }

    const multiSeq: MultiSequenceData = { v: 2, sequences: allSequences };

    saveMutation.mutate({
      payload: {
        name: name.trim(),
        landmarks_sequence: multiSeq,
        duration,
        thumbnail,
      },
      existingId: existingSign?.id,
    });
  };

  const hasDetection = currentLandmarks && (
    currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand
  );

  const canRecord = takes.length < MAX_TAKES && !isRecording && countdown === null;

  return (
    <div className="space-y-6 text-foreground">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <WebcamCapture onLandmarksDetected={setCurrentLandmarks} showLandmarks={true} />
        </div>

        <Card className="shadow-xl bg-card border-border">
          <CardHeader className="bg-gradient-to-r from-primary/50 to-primary/20 text-primary-foreground">
            <CardTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5" />
              수화 녹화하기
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">

            {/* 수화 이름 입력 */}
            <div className="space-y-2">
              <Label htmlFor="sign-name">수화 이름</Label>
              <Input
                id="sign-name"
                placeholder="예: 안녕하세요, 감사합니다, ㄱ"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg bg-background/50"
                disabled={isRecording || countdown !== null}
              />
              {existingSign && name.trim() && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  이미 존재하는 수화입니다. 저장 시 덮어씁니다.
                </p>
              )}
            </div>

            {/* 감지 상태 */}
            {hasDetection ? (
              <div className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                감지됨: {[
                  currentLandmarks.pose && '전신',
                  currentLandmarks.leftHand && '왼손',
                  currentLandmarks.rightHand && '오른손',
                ].filter(Boolean).join(', ')}
              </div>
            ) : (
              <div className="text-xs text-yellow-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                카메라 앞에 서주세요
              </div>
            )}

            {/* 녹화 컨트롤 */}
            <div className="space-y-3 p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary-foreground/90">
                  동작 녹화
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({takes.length}/{MAX_TAKES}테이크)
                  </span>
                </span>
                {isRecording && <Badge variant="destructive" className="animate-pulse">녹화 중</Badge>}
                {countdown !== null && <Badge className="bg-yellow-600 animate-pulse text-white">{countdown}초 후 시작</Badge>}
              </div>

              {/* 카운트다운 표시 */}
              {countdown !== null && (
                <div className="text-center py-4">
                  <div className="text-6xl font-black text-yellow-400 animate-pulse">{countdown}</div>
                  <p className="text-sm text-muted-foreground mt-2">준비하세요!</p>
                </div>
              )}

              {/* 녹화 진행 */}
              {isRecording && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-primary/80">
                    <span>녹화 시간</span>
                    <span className="font-mono font-bold">{recordingTimeSec.toFixed(1)}초 / {MAX_RECORD_SEC}초</span>
                  </div>
                  <Progress value={(recordingTimeSec / MAX_RECORD_SEC) * 100} className="h-2 bg-primary/20" />
                </div>
              )}

              <div className="flex gap-2">
                {countdown !== null ? (
                  <Button onClick={cancelCountdown} variant="outline" className="flex-1">
                    취소
                  </Button>
                ) : !isRecording ? (
                  <Button
                    onClick={prepareRecording}
                    disabled={!hasDetection || !canRecord}
                    className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <Circle className="w-4 h-4 mr-2 fill-current" />
                    {takes.length === 0 ? '녹화 시작' : '다시 녹화'}
                  </Button>
                ) : (
                  <Button onClick={stopRecording} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    <StopCircle className="w-4 h-4 mr-2" />
                    녹화 중지
                  </Button>
                )}
              </div>
            </div>

            {/* 테이크 목록 */}
            {takes.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">
                  녹화된 테이크 <span className="text-xs">(저장 시 좌우반전도 자동 추가)</span>
                </p>
                {takes.map((take, i) => {
                  const quality = calcQuality(take);
                  const qualityColor = quality >= 75 ? 'text-green-400' : quality >= 50 ? 'text-yellow-400' : 'text-red-400';
                  return (
                    <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg text-sm">
                      <span className="text-muted-foreground w-14">테이크 {i + 1}</span>
                      <div className="flex-1 space-y-1">
                        <Progress value={quality} className="h-1.5" />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>손 감지 {take.handDetectionRate.toFixed(0)}%</span>
                          <span>{take.frames.length}프레임 ({take.durationSec.toFixed(1)}s)</span>
                        </div>
                      </div>
                      <span className={`font-bold text-xs w-10 text-right ${qualityColor}`}>
                        {quality.toFixed(0)}점
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteTake(i)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  → 총 {takes.length * 2}개 시퀀스 저장 (원본 {takes.length} + 반전 {takes.length})
                </p>
              </div>
            )}

            {/* 저장 버튼 */}
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || isRecording || takes.length === 0 || countdown !== null}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {saveMutation.isPending
                ? '저장 중...'
                : existingSign && name.trim()
                  ? '수화 업데이트'
                  : '수화 저장하기'}
            </Button>

            {/* 상태 메시지 */}
            {status && (
              <Alert className={status.type === 'success'
                ? 'bg-green-900/30 text-green-300 border-green-700/50'
                : 'bg-red-900/30 text-red-300 border-red-700/50'}>
                {status.type === 'success'
                  ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                  : <AlertCircle className="h-4 w-4 text-red-400" />}
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            )}

            {/* 사용 방법 */}
            <div className="pt-4 border-t border-border">
              <h4 className="font-semibold mb-2 text-sm text-muted-foreground">사용 방법</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>수화 이름 입력</li>
                <li>녹화 시작 → 카운트다운 후 동작 수행</li>
                <li>최대 {MAX_TAKES}번 반복 녹화 (다양한 속도로)</li>
                <li>저장 시 좌우반전 버전도 자동 추가됨</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
