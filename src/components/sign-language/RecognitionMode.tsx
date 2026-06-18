import React, { useState, useEffect, useRef } from 'react';
import { Eye, CheckCircle2, Activity, Trash2, Copy, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { SignLanguage, LandmarksDetected, LandmarkFrame } from '@/lib/supabaseClient';
import { getSignSequences } from '@/lib/supabaseClient';
import { calculateSubsequenceDTW, trimSilence, filterNullFrames, resampleSequence } from '@/lib/featureExtraction';
import { convertToNaturalSentence } from '@/lib/huggingfaceApi';
import { speak, speakWord, stopSpeaking, isTTSSupported } from '@/lib/ttsService';

// ==================================================================
// 1. 인식 파라미터 설정
// ==================================================================

const RECOGNITION_PARAMS = {
  MOTION_BUFFER_DURATION_MS: 2500,
  ANALYSIS_INTERVAL_MS: 150,
  CONVERT_DEBOUNCE_MS: 500,
  MIN_FRAMES_FOR_ANALYSIS: 6,
  MIN_FRAMES_FOR_MOTION_VARIANCE: 4,
  NEUTRAL_POSE_CONFIRMATION_FRAMES: 2,
  CONSECUTIVE_RECOGNITION_FRAMES: 3,
  MOTION_VARIANCE_THRESHOLD: 0.0012,
  DISPLAY_THRESHOLD: 35,
  RECOGNITION_THRESHOLD: 50,
  NEUTRAL_POSE_VISIBILITY_THRESHOLD: 0.5,
  NEUTRAL_POSE_TORSO_FACTOR: 0.35,
  CONSECUTIVE_RECOGNITION_TIMEOUT_MS: 2000,
};

interface RecognitionModeProps {
  currentLandmarks: LandmarksDetected | null;
  signs: SignLanguage[];
}

interface NeutralPoseInput {
  leftHand: LandmarksDetected['leftHand'];
  rightHand: LandmarksDetected['rightHand'];
  pose: LandmarksDetected['pose'];
}

// ==================================================================
// 2. 메인 컴포넌트
// ==================================================================

// P0-1: 사전 필터용 부호 평균 특징
interface SignMean { combined: number[] | null }

// P0-1: 빠른 코사인 유사도 (pre-filter용)
function quickCos(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na > 0 && nb > 0) ? d / Math.sqrt(na * nb) : 0;
}

export default function RecognitionMode({ currentLandmarks, signs }: RecognitionModeProps) {
  const [bestMatch, setBestMatch] = useState<{ sign: SignLanguage; similarity: number } | null>(null);
  const [topMatches, setTopMatches] = useState<{ sign: SignLanguage; similarity: number }[]>([]);
  // P0-2: 매 프레임 setState 제거 → 분석 주기에만 업데이트
  const [motionBufferLen, setMotionBufferLen] = useState(0);
  const [recognizedWords, setRecognizedWords] = useState<string[]>([]);
  const [naturalSentence, setNaturalSentence] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [isTTSEnabled, setIsTTSEnabled] = useState(isTTSSupported());
  // P3-11: 연속 인식 카운트 시각화
  const [consecutiveCount, setConsecutiveCount] = useState(0);

  const motionBufferRef = useRef<LandmarkFrame[]>([]);
  const lastAnalysisRef = useRef(0);
  const processingRef = useRef(false);
  const consecutiveRecognitionRef = useRef<{ signId: string | null; count: number; lastTime: number }>({ signId: null, count: 0, lastTime: 0 });
  const currentRecognizedSignRef = useRef<{ sign: SignLanguage; similarity: number } | null>(null);
  const neutralPoseCountRef = useRef(0);
  const convertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevWordsLengthRef = useRef(0);
  // P0-1: 수화별 평균 특징 캐시
  const signMeansRef = useRef<Map<string, SignMean>>(new Map());

  // P0-1: signs 변경 시 각 수화의 평균 특징 벡터 사전 계산
  useEffect(() => {
    const means = new Map<string, SignMean>();
    for (const sign of signs) {
      const seqs = getSignSequences(sign);
      if (!seqs.length) { means.set(sign.id, { combined: null }); continue; }
      const lhAcc = new Array(33).fill(0), rhAcc = new Array(33).fill(0);
      let lhN = 0, rhN = 0;
      for (const seq of seqs) {
        for (const f of seq) {
          if (f.left_hand_features?.length === 33) {
            f.left_hand_features.forEach((v, i) => lhAcc[i] += v); lhN++;
          }
          if (f.right_hand_features?.length === 33) {
            f.right_hand_features.forEach((v, i) => rhAcc[i] += v); rhN++;
          }
        }
      }
      const lh = lhN > 0 ? lhAcc.map(v => v / lhN) : null;
      const rh = rhN > 0 ? rhAcc.map(v => v / rhN) : null;
      const combined = (lh || rh)
        ? [...(lh ?? new Array(33).fill(0)), ...(rh ?? new Array(33).fill(0))]
        : null;
      means.set(sign.id, { combined });
    }
    signMeansRef.current = means;
  }, [signs]);

  // 세션 복원 (마운트 시)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('haruki_session');
      if (saved) {
        const { words } = JSON.parse(saved);
        if (Array.isArray(words)) {
          setRecognizedWords(words);
          prevWordsLengthRef.current = words.length;
        }
      }
    } catch (e) { console.warn('세션 복원 실패:', e); }
  }, []);

  // 랜드마크 수신 → 동작 버퍼 누적
  useEffect(() => {
    if (!currentLandmarks || !signs || signs.length === 0) return;

    const timestamp = Date.now();
    const frameData: LandmarkFrame = {
      timestamp,
      pose: currentLandmarks.pose,
      left_hand: currentLandmarks.leftHand,
      right_hand: currentLandmarks.rightHand,
      face: currentLandmarks.face,
      left_hand_features: currentLandmarks.leftHandFeatures,
      right_hand_features: currentLandmarks.rightHandFeatures,
      pose_features: currentLandmarks.poseFeatures,
    };

    motionBufferRef.current.push(frameData);
    const cutoffTime = timestamp - RECOGNITION_PARAMS.MOTION_BUFFER_DURATION_MS;
    motionBufferRef.current = motionBufferRef.current.filter(f => f.timestamp > cutoffTime);
    // P0-2: 매 프레임 setState 제거 → analyzeMotion에서만 업데이트

    if (
      timestamp - lastAnalysisRef.current > RECOGNITION_PARAMS.ANALYSIS_INTERVAL_MS &&
      motionBufferRef.current.length >= RECOGNITION_PARAMS.MIN_FRAMES_FOR_ANALYSIS
    ) {
      lastAnalysisRef.current = timestamp;
      analyzeMotion();
    }
  }, [currentLandmarks, signs]);

  // AI 문장 변환 (디바운스)
  useEffect(() => {
    if (recognizedWords.length === 0) {
      setNaturalSentence('');
      return;
    }
    if (convertTimeoutRef.current) clearTimeout(convertTimeoutRef.current);
    convertTimeoutRef.current = setTimeout(async () => {
      setIsConverting(true);
      try {
        const sentence = await convertToNaturalSentence(recognizedWords);
        setNaturalSentence(sentence);
      } catch {
        setNaturalSentence(recognizedWords.join(' '));
      } finally {
        setIsConverting(false);
      }
    }, RECOGNITION_PARAMS.CONVERT_DEBOUNCE_MS);
    return () => { if (convertTimeoutRef.current) clearTimeout(convertTimeoutRef.current); };
  }, [recognizedWords]);

  // TTS: 새 단어 인식 시 단어 음성 출력 (문장 읽기 중이면 방해 안 함)
  useEffect(() => {
    if (!isTTSEnabled) return;
    if (recognizedWords.length > prevWordsLengthRef.current) {
      speakWord(recognizedWords[recognizedWords.length - 1]);
    }
    prevWordsLengthRef.current = recognizedWords.length;
  }, [recognizedWords, isTTSEnabled]);

  // 세션 저장 (단어 변경 시)
  useEffect(() => {
    try {
      localStorage.setItem('haruki_session', JSON.stringify({ words: recognizedWords }));
    } catch (e) { console.warn('세션 저장 실패:', e); }
  }, [recognizedWords]);

  const isNeutralPose = (landmarks: NeutralPoseInput): boolean => {
    if (!landmarks) return false;
    const hasLeftHand = landmarks.leftHand && landmarks.leftHand.length > 0;
    const hasRightHand = landmarks.rightHand && landmarks.rightHand.length > 0;
    if (!hasLeftHand && !hasRightHand) return true;
    if (!landmarks.pose || landmarks.pose.length < 33) return false;

    const leftShoulder = landmarks.pose[11];
    const rightShoulder = landmarks.pose[12];
    const leftHip = landmarks.pose[23];
    const rightHip = landmarks.pose[24];
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const torsoLength = hipY - shoulderY;
    const neutralThreshold = shoulderY + torsoLength * RECOGNITION_PARAMS.NEUTRAL_POSE_TORSO_FACTOR;

    let allHandsBelow = true;
    if (hasLeftHand && landmarks.leftHand) {
      const leftWrist = landmarks.leftHand[0];
      const visibility = leftWrist.visibility !== undefined ? leftWrist.visibility : 1.0;
      if (visibility < RECOGNITION_PARAMS.NEUTRAL_POSE_VISIBILITY_THRESHOLD || leftWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }
    if (hasRightHand && landmarks.rightHand) {
      const rightWrist = landmarks.rightHand[0];
      const visibility = rightWrist.visibility !== undefined ? rightWrist.visibility : 1.0;
      if (visibility < RECOGNITION_PARAMS.NEUTRAL_POSE_VISIBILITY_THRESHOLD || rightWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }
    return allHandsBelow;
  };

  const calculateMotionVariance = (buffer: LandmarkFrame[]): number => {
    if (buffer.length < 3) return 0;
    let totalVariance = 0;
    let count = 0;
    for (let i = 1; i < buffer.length; i++) {
      const prev = buffer[i - 1];
      const curr = buffer[i];
      if (prev.left_hand_features && curr.left_hand_features) {
        const dims = prev.left_hand_features.length;
        const variance = prev.left_hand_features.reduce(
          (sum, val, idx) => sum + Math.abs(val - (curr.left_hand_features![idx] ?? 0)), 0
        ) / dims; // 차원당 평균으로 정규화
        totalVariance += variance;
        count++;
      }
      if (prev.right_hand_features && curr.right_hand_features) {
        const dims = prev.right_hand_features.length;
        const variance = prev.right_hand_features.reduce(
          (sum, val, idx) => sum + Math.abs(val - (curr.right_hand_features![idx] ?? 0)), 0
        ) / dims;
        totalVariance += variance;
        count++;
      }
    }
    return count > 0 ? totalVariance / count : 0;
  };

  const analyzeMotion = (): void => {
    if (processingRef.current) return;
    processingRef.current = true;

    setTimeout(() => {
      try {
      // P0-2: 분석 주기에만 버퍼 길이 업데이트
      setMotionBufferLen(motionBufferRef.current.length);

      const latestFrame = motionBufferRef.current[motionBufferRef.current.length - 1];
      if (!latestFrame) { processingRef.current = false; return; }

      const isNeutral = isNeutralPose({
        leftHand: latestFrame.left_hand,
        rightHand: latestFrame.right_hand,
        pose: latestFrame.pose,
      });

      if (isNeutral) {
        neutralPoseCountRef.current++;
        if (
          neutralPoseCountRef.current >= RECOGNITION_PARAMS.NEUTRAL_POSE_CONFIRMATION_FRAMES &&
          currentRecognizedSignRef.current
        ) {
          const signToAdd = currentRecognizedSignRef.current;
          setRecognizedWords(prev => [...prev, signToAdd.sign.name]);
          // 단어 확정 후 버퍼 초기화 → 동일 단어 연속 인식 허용, 잔류 프레임 오인식 방지
          motionBufferRef.current = [];
          currentRecognizedSignRef.current = null;
          setBestMatch(null);
          setTopMatches([]);
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
          setConsecutiveCount(0);
          neutralPoseCountRef.current = 0;
        }
        processingRef.current = false;
        return;
      }

      neutralPoseCountRef.current = 0;

      if (motionBufferRef.current.length < RECOGNITION_PARAMS.MIN_FRAMES_FOR_MOTION_VARIANCE) {
        setBestMatch(null);
        currentRecognizedSignRef.current = null;
        processingRef.current = false;
        return;
      }

      // 버퍼 전처리: null 프레임 제거 → silence trim
      const cleanBuffer = trimSilence(filterNullFrames(motionBufferRef.current));
      if (cleanBuffer.length < RECOGNITION_PARAMS.MIN_FRAMES_FOR_ANALYSIS) {
        processingRef.current = false;
        return;
      }

      // P1-5: 손 특징 존재 여부로 게이팅 (정적 수화 포함)
      const hasHand = cleanBuffer.some(f => f.left_hand_features !== null || f.right_hand_features !== null);
      if (!hasHand) {
        setBestMatch(null);
        currentRecognizedSignRef.current = null;
        processingRef.current = false;
        return;
      }

      // 정적 수화 감지 (동작 없이 손 모양만 유지) — cleanBuffer 기준으로 계산
      const motionVariance = calculateMotionVariance(cleanBuffer);
      const isStatic = motionVariance <= RECOGNITION_PARAMS.MOTION_VARIANCE_THRESHOLD;
      // 정적 수화는 오인식 방지를 위해 임계값 소폭 상향
      const displayThresh = isStatic
        ? RECOGNITION_PARAMS.DISPLAY_THRESHOLD + 3
        : RECOGNITION_PARAMS.DISPLAY_THRESHOLD;
      const recognitionThresh = isStatic
        ? RECOGNITION_PARAMS.RECOGNITION_THRESHOLD + 2
        : RECOGNITION_PARAMS.RECOGNITION_THRESHOLD;

      // P0-1: 코사인 사전 필터 — signs > 12개일 때만 적용
      const PRE_FILTER_K = 12;
      let candidateSigns = signs;
      if (signs.length > PRE_FILTER_K) {
        // 버퍼 평균 특징 계산
        const lhAcc = new Array(33).fill(0), rhAcc = new Array(33).fill(0);
        let lhN = 0, rhN = 0;
        for (const f of cleanBuffer) {
          if (f.left_hand_features?.length === 33) {
            f.left_hand_features.forEach((v, i) => lhAcc[i] += v); lhN++;
          }
          if (f.right_hand_features?.length === 33) {
            f.right_hand_features.forEach((v, i) => rhAcc[i] += v); rhN++;
          }
        }
        const lh = lhN > 0 ? lhAcc.map(v => v / lhN) : null;
        const rh = rhN > 0 ? rhAcc.map(v => v / rhN) : null;
        const bufCombined = (lh || rh)
          ? [...(lh ?? new Array(33).fill(0)), ...(rh ?? new Array(33).fill(0))]
          : null;
        if (bufCombined) {
          candidateSigns = signs
            .map(sign => {
              const mean = signMeansRef.current.get(sign.id)?.combined;
              // 버그 수정: mean 없으면 0이 아닌 0.5 (중간 순위 배정)
              return { sign, preScore: mean ? quickCos(bufCombined, mean) : 0.5 };
            })
            .sort((a, b) => b.preScore - a.preScore)
            .slice(0, PRE_FILTER_K)
            .map(s => s.sign);
        }
      }

      // DTW 스코어링: 리샘플링(속도 정규화) + SDTW(최적 부분구간)
      // 두 방법의 점수를 앙상블하여 우연한 고점수 방지
      const results = candidateSigns
        .map(sign => {
          const sequences = getSignSequences(sign);
          if (sequences.length === 0) return null;
          const scores = sequences.map(seq => {
            if (seq.length < 2) return 0;
            // 1) 리샘플링: 버퍼를 시퀀스 길이에 맞게 속도 정규화
            const resampledBuffer = resampleSequence(cleanBuffer, Math.max(6, seq.length));
            const score1 = calculateSubsequenceDTW(resampledBuffer, seq);
            // 2) 원본 SDTW: 최적 부분 구간 탐색 (속도 차이에 유연)
            const score2 = calculateSubsequenceDTW(cleanBuffer, seq);
            // 더 높은 쪽 70% + 더 낮은 쪽 30% — 극단적 행운 점수 완화
            const hi = Math.max(score1, score2);
            const lo = Math.min(score1, score2);
            return hi * 0.7 + lo * 0.3;
          });
          // 최고 점수 사용 (앙상블은 진짜 매칭 점수를 불필요하게 낮춤)
          const best = Math.max(...scores);
          return { sign, similarity: best * 100 };
        })
        .filter(Boolean) as { sign: SignLanguage; similarity: number }[];

      results.sort((a, b) => b.similarity - a.similarity);

      // 디버그: 상위 점수 콘솔 출력 (개발 확인용)
      if (results.length > 0) {
        console.log('[Recognition]', results.slice(0, 3).map(r => `${r.sign.name}:${r.similarity.toFixed(1)}%`).join(' | '));
      }

      const topCandidates = results.slice(0, 5).filter(r => r.similarity > displayThresh);
      setTopMatches(topCandidates);

      if (topCandidates.length > 0) {
        const bestResult = topCandidates[0];
        setBestMatch(bestResult);

        if (bestResult.similarity >= recognitionThresh) {
          const now = Date.now();
          if (consecutiveRecognitionRef.current.signId === bestResult.sign.id) {
            consecutiveRecognitionRef.current.count++;
            consecutiveRecognitionRef.current.lastTime = now;
          } else {
            consecutiveRecognitionRef.current = { signId: bestResult.sign.id, count: 1, lastTime: now };
          }
          // P3-11: 연속 카운트 상태 업데이트
          setConsecutiveCount(consecutiveRecognitionRef.current.count);
          if (consecutiveRecognitionRef.current.count >= RECOGNITION_PARAMS.CONSECUTIVE_RECOGNITION_FRAMES) {
            currentRecognizedSignRef.current = bestResult;
          }
        } else {
          if (consecutiveRecognitionRef.current.signId !== bestResult.sign.id) {
            consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
            setConsecutiveCount(0);
          }
        }
      } else {
        setBestMatch(null);
        setTopMatches([]);
        if (Date.now() - consecutiveRecognitionRef.current.lastTime > RECOGNITION_PARAMS.CONSECUTIVE_RECOGNITION_TIMEOUT_MS) {
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
          currentRecognizedSignRef.current = null;
          setConsecutiveCount(0);
        }
      }

      processingRef.current = false;
      } catch (e) {
        console.error('[RecognitionMode] 분석 오류:', e);
        processingRef.current = false;
      }
    }, 0);
  };

  const clearSentence = (): void => {
    stopSpeaking();
    setRecognizedWords([]);
    prevWordsLengthRef.current = 0;
    localStorage.removeItem('haruki_session');
  };

  const deleteWord = (index: number): void => {
    setRecognizedWords(prev => prev.filter((_, i) => i !== index));
  };

  const copySentence = (): void => {
    navigator.clipboard.writeText(recognizedWords.join(' '));
  };

  const hasDetection = currentLandmarks && (
    currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* 인식된 문장 카드 */}
      <RecognizedSentenceCard
        recognizedWords={recognizedWords}
        naturalSentence={naturalSentence}
        isConverting={isConverting}
        isTTSEnabled={isTTSEnabled}
        onTTSToggle={() => setIsTTSEnabled(v => !v)}
        onCopy={copySentence}
        onClear={clearSentence}
        onDeleteWord={deleteWord}
        onSpeakSentence={() => speak(naturalSentence)}
      />
      {/* 실시간 인식 카드 */}
      <LiveRecognitionCard
        signs={signs}
        hasDetection={!!hasDetection}
        bestMatch={bestMatch}
        topMatches={topMatches}
        motionBufferLength={motionBufferLen}
        consecutiveCount={consecutiveCount}
        consecutiveTotal={RECOGNITION_PARAMS.CONSECUTIVE_RECOGNITION_FRAMES}
      />
    </div>
  );
}

// ==================================================================
// 3. 서브 컴포넌트
// ==================================================================

interface RecognizedSentenceCardProps {
  recognizedWords: string[];
  naturalSentence: string;
  isConverting: boolean;
  isTTSEnabled: boolean;
  onTTSToggle: () => void;
  onCopy: () => void;
  onClear: () => void;
  onDeleteWord: (index: number) => void;
  onSpeakSentence: () => void;
}

const RecognizedSentenceCard = ({
  recognizedWords, naturalSentence, isConverting, isTTSEnabled, onTTSToggle, onCopy, onClear, onDeleteWord, onSpeakSentence,
}: RecognizedSentenceCardProps) => (
  <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden shadow-xl">
    {/* 헤더: 액션 버튼들 */}
    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">인식된 문장</span>
      </div>
      <div className="flex items-center gap-1">
        {/* TTS 토글 */}
        <button
          title={isTTSEnabled ? '음성 끄기' : '음성 켜기'}
          onClick={onTTSToggle}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          {isTTSEnabled
            ? <Volume2 className="w-4 h-4 text-cyan-400" />
            : <VolumeX className="w-4 h-4 text-white/30" />
          }
        </button>
        {/* 문장 읽기 버튼 (문장 있을 때만) */}
        {naturalSentence && (
          <button
            title="문장 읽기"
            onClick={onSpeakSentence}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Volume2 className="w-4 h-4 text-emerald-400" />
          </button>
        )}
        {recognizedWords.length > 0 && (
          <>
            <button
              title="복사"
              onClick={onCopy}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Copy className="w-4 h-4 text-white/50 hover:text-white/80" />
            </button>
            <button
              title="초기화"
              onClick={onClear}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <Trash2 className="w-4 h-4 text-white/50 hover:text-red-400" />
            </button>
          </>
        )}
      </div>
    </div>

    <div className="p-4 space-y-3">
      {recognizedWords.length === 0 ? (
        /* 빈 상태 */
        <div className="text-center py-6">
          <p className="text-white/20 text-sm">수화를 시작하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <>
          {/* 인식된 단어 pill 목록 */}
          <div className="flex flex-wrap gap-2 min-h-[36px]">
            {recognizedWords.map((word, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-3 py-1 bg-white/10 border border-white/15 rounded-full text-sm text-white/80 hover:border-white/30 transition-colors group"
              >
                {word}
                <button
                  onClick={() => onDeleteWord(idx)}
                  className="ml-0.5 text-white/30 hover:text-red-400 transition-colors leading-none"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          {/* AI 변환 문장 */}
          <div className="rounded-xl p-3 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-[11px] text-cyan-400/80 font-semibold uppercase tracking-wider">AI 문장</span>
              {isConverting && (
                <span className="text-[10px] text-cyan-400/50 animate-pulse">변환 중...</span>
              )}
            </div>
            <p className="text-xl font-bold text-white leading-snug">
              {naturalSentence || (
                <span className="text-white/30 font-normal text-base">변환 중...</span>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  </div>
);

// 신뢰도에 따른 색상 반환 헬퍼
const getConfidenceColor = (similarity: number): string => {
  if (similarity >= 75) return 'text-emerald-400';
  if (similarity >= 60) return 'text-yellow-400';
  return 'text-orange-400';
};

const getConfidenceBarClass = (similarity: number): string => {
  if (similarity >= 75) return '[&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-green-400';
  if (similarity >= 60) return '[&>div]:bg-gradient-to-r [&>div]:from-yellow-500 [&>div]:to-amber-400';
  return '[&>div]:bg-gradient-to-r [&>div]:from-orange-500 [&>div]:to-red-400';
};

const getGlowClass = (similarity: number): string => {
  if (similarity >= 75) return 'shadow-[0_0_20px_rgba(52,211,153,0.25)] border-emerald-500/40';
  if (similarity >= 60) return 'shadow-[0_0_20px_rgba(250,204,21,0.2)] border-yellow-500/40';
  return 'shadow-[0_0_16px_rgba(251,146,60,0.2)] border-orange-500/30';
};

interface LiveRecognitionCardProps {
  signs: SignLanguage[];
  hasDetection: boolean;
  bestMatch: { sign: SignLanguage; similarity: number } | null;
  topMatches: { sign: SignLanguage; similarity: number }[];
  motionBufferLength: number;
  consecutiveCount: number;
  consecutiveTotal: number;
}

const LiveRecognitionCard = ({ signs, hasDetection, bestMatch, topMatches, motionBufferLength, consecutiveCount, consecutiveTotal }: LiveRecognitionCardProps) => (
  <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden shadow-xl flex-1">
    {/* 헤더 */}
    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/5">
      <Eye className="w-4 h-4 text-purple-400" />
      <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">실시간 인식</span>
      {/* 감지 상태 인디케이터 */}
      <div className={`ml-auto w-2 h-2 rounded-full ${hasDetection ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
    </div>

    <div className="p-4 space-y-3">
      {/* 수화 없을 때 */}
      {!signs || signs.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-yellow-400/70 text-sm">학습 모드에서 수화를 먼저 저장해주세요</p>
        </div>
      ) : !hasDetection ? (
        <div className="text-center py-8">
          <Activity className="w-8 h-8 text-white/15 mx-auto mb-2" />
          <p className="text-white/30 text-sm">카메라 앞에 서주세요</p>
        </div>
      ) : bestMatch ? (
        /* 매칭 결과 표시 */
        <div className={`rounded-xl p-4 border bg-black/30 transition-all duration-300 ${getGlowClass(bestMatch.similarity)}`}>
          <div className="flex items-start justify-between mb-3">
            {/* 인식된 단어 크게 표시 */}
            <p className="text-5xl font-black text-white tracking-tight leading-none">
              {bestMatch.sign.name}
            </p>
            {/* 신뢰도 수치 */}
            <span className={`text-lg font-bold font-mono ${getConfidenceColor(bestMatch.similarity)}`}>
              {bestMatch.similarity.toFixed(0)}%
            </span>
          </div>
          {/* 신뢰도 Progress Bar (그라데이션) */}
          <Progress
            value={bestMatch.similarity}
            className={`h-2 bg-white/10 ${getConfidenceBarClass(bestMatch.similarity)}`}
          />
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xs font-medium ${getConfidenceColor(bestMatch.similarity)}`}>
              {bestMatch.similarity >= 75
                ? '인식 확정됨'
                : bestMatch.similarity >= 60
                  ? '감지 중...'
                  : '후보 감지'
              }
            </p>
            {/* P3-11: 연속 인식 카운트 시각화 */}
            {consecutiveCount > 0 && (
              <div className="flex items-center gap-1.5">
                {Array.from({ length: consecutiveTotal }, (_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      i < consecutiveCount ? 'bg-emerald-400 scale-110' : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 대기 상태 */
        <div className="text-center py-8">
          <div className="text-5xl font-black text-white/10 mb-2">—</div>
          <p className="text-white/25 text-sm">수화를 수행하세요</p>
        </div>
      )}

      {/* 후보 목록 (2위 이하) */}
      {topMatches.length > 1 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-white/30 font-semibold uppercase tracking-wider px-1">후보</p>
          {topMatches.slice(1).map((m, i) => (
            <div
              key={m.sign.id}
              className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/5"
            >
              <span className="text-white/50 text-sm">{i + 2}. {m.sign.name}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/30 rounded-full"
                    style={{ width: `${m.similarity}%` }}
                  />
                </div>
                <span className="text-white/40 text-xs font-mono w-8 text-right">
                  {m.similarity.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 동작 버퍼 진행 바 (미니멀) */}
      {motionBufferLength > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/25 uppercase tracking-wider">버퍼</span>
            <span className="text-[10px] text-white/25 font-mono">{motionBufferLength}f</span>
          </div>
          <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500/50 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((motionBufferLength / 90) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  </div>
);
