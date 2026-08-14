import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { Save, Hand, CheckCircle2, AlertCircle, Circle, StopCircle, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import WebcamCapture from "@/components/sign-language/WebcamCapture";
import type { SignLanguage, SignMeta, LandmarksDetected, LandmarkFrame, MultiSequenceData } from '@/lib/supabaseClient';
import { getSignSequences } from '@/lib/supabaseClient';
import { trimSilence, flipSequence, resampleSequence } from '@/lib/featureExtraction';

interface LearningModeProps {
  signs: SignMeta[];
  onSaved?: () => void; // 저장 후 부모 캐시 무효화 콜백
}

interface TakeInfo {
  frames: LandmarkFrame[];
  handDetectionRate: number;
  durationSec: number;
}

const MAX_TAKES = 5;       // 3→5: 다양한 속도·각도 확보
const MAX_RECORD_SEC = 8;  // 6→8: 느린 동작도 완전히 담을 수 있도록

// 속도 변형 증강: FrameFeatures를 리샘플하여 LandmarkFrame으로 패킹
// 원본 raw landmarks은 null로 두고 feature array만 보존 (인식에는 feature만 사용됨)
function makeSpeedVariant(frames: LandmarkFrame[], ratio: number): LandmarkFrame[] {
  const targetLen = Math.round(frames.length * ratio);
  if (targetLen < 5 || targetLen === frames.length) return frames;
  const resampled = resampleSequence(frames, targetLen);
  const lastTs = frames.length > 1 ? frames[frames.length - 1].timestamp : 1000;
  return resampled.map((f, i) => ({
    timestamp: Math.round((i / Math.max(resampled.length - 1, 1)) * lastTs * ratio),
    pose: null, left_hand: null, right_hand: null,
    face: f.face,
    left_hand_features: f.left_hand_features,
    right_hand_features: f.right_hand_features,
    pose_features: f.pose_features,
    inter_hand_features: f.inter_hand_features ?? null,
  }));
}

// 테이크 품질 점수 계산 (0~100)
function calcQuality(take: TakeInfo): number {
  const detectionScore = take.handDetectionRate * 0.6;
  const lengthScore = Math.min(1, take.durationSec / 2) * 40; // 2초 이상이면 만점
  return Math.min(100, detectionScore + lengthScore);
}

export default function LearningMode({ signs, onSaved }: LearningModeProps) {
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
  const webcamCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 같은 이름의 기존 수화 전체 목록
  const existingSigns = signs.filter(s => s.name === name.trim());

  // ---------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: async ({ payload, existingIds, isUpdate }: {
      payload: Omit<SignLanguage, 'id' | 'created_at' | 'updated_at'>;
      existingIds: string[];
      isUpdate: boolean;
    }) => {
      let mergedPayload = { ...payload };

      if (existingIds.length > 0) {
        // 기존 시퀀스(배치학습 포함) 불러와서 새 시퀀스와 병합
        const existingSign = await base44.entities.SignLanguage.get(existingIds[0]);
        if (existingSign) {
          const existingSeqs = getSignSequences(existingSign);
          const newSeqs = (payload.landmarks_sequence as MultiSequenceData).sequences;
          mergedPayload = {
            ...payload,
            landmarks_sequence: { v: 2, sequences: [...existingSeqs, ...newSeqs] },
            duration: Math.max(existingSign.duration ?? 0, payload.duration),
          };
        }
        // 기존 행 전부 삭제 (병합본으로 교체)
        await Promise.all(existingIds.map(id => base44.entities.SignLanguage.delete(id)));
      }

      return base44.entities.SignLanguage.create(mergedPayload);
    },
    onSuccess: (_, variables) => {
      onSaved?.();
      const msg = variables.isUpdate ? '기존 수화를 업데이트했습니다!' : '수화가 저장되었습니다!';
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
  // 녹화 함수 (countdown useEffect보다 먼저 선언 — forward reference 방지)
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
    // trim 전후 기준점 차이를 반영한 실제 구간 길이
    const durationSec = trimmed.length > 1
      ? (trimmed[trimmed.length - 1].timestamp - trimmed[0].timestamp) / 1000
      : 0;

    if (handDetectionRate < 55) {
      setStatusTimed({ type: 'error', message: `손 감지율이 너무 낮습니다 (${handDetectionRate.toFixed(0)}%). 손이 카메라에 잘 보이도록 해주세요.` }, 4000);
      return;
    }

    setTakes(prev => [...prev, { frames: trimmed, handDetectionRate, durationSec }]);
  }, [isRecording]);

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
  }, [countdown, startRecordingNow]);

  // ---------------------------------------------------------------
  // 프레임 수집 (녹화 중에만)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!isRecording || !currentLandmarks || !startTimeRef.current) return;

    const timestamp = Date.now() - startTimeRef.current;
    const frame: LandmarkFrame = {
      timestamp,
      // raw 랜드마크(pose/left_hand/right_hand)는 저장하지 않는다 — 인식은 feature
      // 벡터만 사용하며, raw까지 저장하면 행당 수 MB로 커져 조회 timeout을 유발한다.
      pose: null,
      left_hand: null,
      right_hand: null,
      face: currentLandmarks.face ?? null,
      left_hand_features: currentLandmarks.leftHandFeatures ?? null,
      right_hand_features: currentLandmarks.rightHandFeatures ?? null,
      pose_features: currentLandmarks.poseFeatures ?? null,
      inter_hand_features: currentLandmarks.interHandFeatures ?? null,
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

    // 각 테이크에 좌우반전 + 속도 변형(0.75x, 1.25x) 증강 추가
    const allSequences: LandmarkFrame[][] = [];
    for (const take of takes) {
      allSequences.push(take.frames);
      allSequences.push(flipSequence(take.frames));
      // 속도 변형: 긴 동작에만 적용 (0.8초 이상)
      if (take.durationSec >= 0.8) {
        allSequences.push(makeSpeedVariant(take.frames, 0.75));
        allSequences.push(makeSpeedVariant(take.frames, 1.25));
      }
    }

    const bestTake = takes.reduce((best, t) => calcQuality(t) > calcQuality(best) ? t : best);
    const duration = bestTake.durationSec;

    // 썸네일 캡처 — 학습 모드 내 WebcamCapture canvas 사용
    let thumbnail: string | null = null;
    try {
      if (webcamCanvasRef.current) {
        thumbnail = webcamCanvasRef.current.toDataURL('image/jpeg', 0.6);
      }
    } catch (e) { console.warn('썸네일 캡처 실패:', e); }

    const multiSeq: MultiSequenceData = { v: 2, sequences: allSequences };

    saveMutation.mutate({
      payload: {
        name: name.trim(),
        landmarks_sequence: multiSeq,
        duration,
        thumbnail,
      },
      existingIds: existingSigns.map(s => s.id),
      isUpdate: existingSigns.length > 0,
    });
  };

  const hasDetection = currentLandmarks && (
    currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand
  );

  const canRecord = takes.length < MAX_TAKES && !isRecording && countdown === null;

  return (
    <div className="space-y-6 text-foreground">
      <div className="grid md:grid-cols-2 gap-6">
        <div ref={node => {
          // 학습 모드 내 첫 번째 canvas 참조 (썸네일용)
          if (node) webcamCanvasRef.current = node.querySelector('canvas');
        }}>
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
              {existingSigns.length > 0 && name.trim() && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  이미 존재하는 수화입니다{existingSigns.length > 1 ? ` (${existingSigns.length}개)` : ''}. 저장 시 모두 교체됩니다.
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
                  녹화된 테이크 <span className="text-xs">(저장 시 반전·속도변형 자동 추가)</span>
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
                  → 저장 시 반전 + 속도변형(0.75x·1.25x) 자동 추가 (최대 {takes.length * 4}개 시퀀스)
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
                : existingSigns.length > 0 && name.trim()
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
                <li>저장 시 좌우반전·속도변형 버전 자동 추가</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
