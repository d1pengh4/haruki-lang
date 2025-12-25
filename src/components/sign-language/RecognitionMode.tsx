import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, CheckCircle2, AlertCircle, TrendingUp, Activity, Trash2, Copy, Sparkles } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SignLanguage } from '@/lib/supabaseClient';
import { calculateFeatureSimilarity } from '@/lib/featureExtraction';
import { convertToNaturalSentence } from '@/lib/huggingfaceApi';

// ==================================================================
// 1. Constants and Configuration
// ==================================================================

/**
 * Parameters for the sign language recognition algorithm.
 * Grouping these values makes them easier to tune.
 */
const RECOGNITION_PARAMS = {
  // Timing and Buffers
  MOTION_BUFFER_DURATION_MS: 3000,
  ANALYSIS_INTERVAL_MS: 300,
  CONVERT_DEBOUNCE_MS: 500,

  // Frame Counts
  MIN_FRAMES_FOR_ANALYSIS: 15,
  MIN_FRAMES_FOR_MOTION_VARIANCE: 8,
  NEUTRAL_POSE_CONFIRMATION_FRAMES: 3,
  CONSECUTIVE_RECOGNITION_FRAMES: 1,

  // Thresholds
  MOTION_VARIANCE_THRESHOLD: 0.002,
  DISPLAY_THRESHOLD: 55, // Similarity score to show a potential match
  RECOGNITION_THRESHOLD: 60, // Similarity score to confirm a match
  NEUTRAL_POSE_VISIBILITY_THRESHOLD: 0.5,
  NEUTRAL_POSE_TORSO_FACTOR: 0.5,
  
  // Timeouts
  CONSECUTIVE_RECOGNITION_TIMEOUT_MS: 1000,
};

interface RecognitionModeProps {
  currentLandmarks: any;
  signs: SignLanguage[];
}

// ==================================================================
// 2. Main Component
// ==================================================================

export default function RecognitionMode({ currentLandmarks, signs }: RecognitionModeProps) {
  // State for UI and recognition results
  const [bestMatch, setBestMatch] = useState<{ sign: SignLanguage; similarity: number } | null>(null);
  const [motionBuffer, setMotionBuffer] = useState<any[]>([]);
  const [recognizedWords, setRecognizedWords] = useState<string[]>([]);
  const [naturalSentence, setNaturalSentence] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [lastRecognizedId, setLastRecognizedId] = useState<string | null>(null);

  // Refs for managing complex logic and avoiding re-renders
  const motionBufferRef = useRef<any[]>([]);
  const lastAnalysisRef = useRef(0);
  const processingRef = useRef(false);
  const consecutiveRecognitionRef = useRef({ signId: null as string | null, count: 0, lastTime: 0 });
  const currentRecognizedSignRef = useRef<{ sign: SignLanguage; similarity: number } | null>(null);
  const neutralPoseCountRef = useRef(0);
  const convertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  /**
   * Effect to handle incoming landmark data from the webcam.
   * It populates and prunes the motion buffer, then triggers analysis.
   */
  useEffect(() => {
    if (!currentLandmarks || !signs || signs.length === 0) return;

    const timestamp = Date.now();
    const frameData = {
      timestamp,
      pose: currentLandmarks.pose || null,
      left_hand: currentLandmarks.leftHand || null,
      right_hand: currentLandmarks.rightHand || null,
      face: currentLandmarks.face || null,
      left_hand_features: currentLandmarks.leftHandFeatures || null,
      right_hand_features: currentLandmarks.rightHandFeatures || null,
      pose_features: currentLandmarks.poseFeatures || null
    };

    motionBufferRef.current.push(frameData);

    const cutoffTime = timestamp - RECOGNITION_PARAMS.MOTION_BUFFER_DURATION_MS;
    motionBufferRef.current = motionBufferRef.current.filter(f => f.timestamp > cutoffTime);

    setMotionBuffer(motionBufferRef.current);

    if (timestamp - lastAnalysisRef.current > RECOGNITION_PARAMS.ANALYSIS_INTERVAL_MS && motionBufferRef.current.length >= RECOGNITION_PARAMS.MIN_FRAMES_FOR_ANALYSIS) {
      lastAnalysisRef.current = timestamp;
      analyzeMotion();
    }
  }, [currentLandmarks, signs]);

  /**
   * Effect to trigger natural sentence conversion when the list of recognized words changes.
   * Debounces the API call to avoid excessive requests.
   */
  useEffect(() => {
    if (recognizedWords.length === 0) {
      setNaturalSentence("");
      return;
    }

    if (convertTimeoutRef.current) clearTimeout(convertTimeoutRef.current);

    convertTimeoutRef.current = setTimeout(async () => {
      setIsConverting(true);
      try {
        const sentence = await convertToNaturalSentence(recognizedWords);
        setNaturalSentence(sentence);
      } catch (error) {
        console.error('❌ 문장 변환 오류:', error);
        setNaturalSentence(recognizedWords.join(' '));
      } finally {
        setIsConverting(false);
      }
    }, RECOGNITION_PARAMS.CONVERT_DEBOUNCE_MS);

    return () => {
      if (convertTimeoutRef.current) clearTimeout(convertTimeoutRef.current);
    };
  }, [recognizedWords]);

  // The core recognition logic and helper functions remain unchanged as requested,
  // but they now use the constants from RECOGNITION_PARAMS.
  // ... isNeutralPose, calculateMotionVariance, analyzeMotion, etc. ...
  
  // NOTE: The user requested not to touch the algorithm. The following functions
  // are the implementation of that algorithm, now using the params object.
  const isNeutralPose = (landmarks) => {
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
    const neutralThreshold = shoulderY + (torsoLength * RECOGNITION_PARAMS.NEUTRAL_POSE_TORSO_FACTOR);

    let allHandsBelow = true;
    if (hasLeftHand) {
      const leftWrist = landmarks.leftHand[0];
      const visibility = leftWrist.visibility !== undefined ? leftWrist.visibility : 1.0;
      if (visibility < RECOGNITION_PARAMS.NEUTRAL_POSE_VISIBILITY_THRESHOLD || leftWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }
    if (hasRightHand) {
      const rightWrist = landmarks.rightHand[0];
      const visibility = rightWrist.visibility !== undefined ? rightWrist.visibility : 1.0;
      if (visibility < RECOGNITION_PARAMS.NEUTRAL_POSE_VISIBILITY_THRESHOLD || rightWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }
    return allHandsBelow;
  };

  const calculateMotionVariance = (buffer) => {
    if (buffer.length < 3) return 0;
    let totalVariance = 0;
    let count = 0;
    for (let i = 1; i < buffer.length; i++) {
      const prev = buffer[i - 1];
      const curr = buffer[i];
      if (prev.left_hand_features && curr.left_hand_features) {
        const variance = prev.left_hand_features.reduce((sum, val, idx) => sum + Math.abs(val - (curr.left_hand_features[idx] || 0)), 0);
        totalVariance += variance;
        count++;
      }
      if (prev.right_hand_features && curr.right_hand_features) {
        const variance = prev.right_hand_features.reduce((sum, val, idx) => sum + Math.abs(val - (curr.right_hand_features[idx] || 0)), 0);
        totalVariance += variance;
        count++;
      }
    }
    return count > 0 ? totalVariance / count : 0;
  };

  const analyzeMotion = () => {
    if (processingRef.current) return;
    processingRef.current = true;

    setTimeout(() => {
      const latestFrame = motionBufferRef.current[motionBufferRef.current.length - 1];
      if (!latestFrame) {
        processingRef.current = false;
        return;
      }
      const isNeutral = isNeutralPose({
        leftHand: latestFrame.left_hand,
        rightHand: latestFrame.right_hand,
        pose: latestFrame.pose
      });

      if (isNeutral) {
        neutralPoseCountRef.current++;
        if (neutralPoseCountRef.current >= RECOGNITION_PARAMS.NEUTRAL_POSE_CONFIRMATION_FRAMES && currentRecognizedSignRef.current) {
          const signToAdd = currentRecognizedSignRef.current;
          if (lastRecognizedId !== signToAdd.sign.id) {
            setRecognizedWords(prev => [...prev, signToAdd.sign.name]);
            setLastRecognizedId(signToAdd.sign.id);
          }
          currentRecognizedSignRef.current = null;
          setBestMatch(null);
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
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

      const motionVariance = calculateMotionVariance(motionBufferRef.current);
      if (motionVariance <= RECOGNITION_PARAMS.MOTION_VARIANCE_THRESHOLD) {
        setBestMatch(null);
        currentRecognizedSignRef.current = null;
        processingRef.current = false;
        return;
      }

      const results = signs.map(sign => {
        if (!sign.landmarks_sequence || sign.landmarks_sequence.length < 5) return null;
        const similarity = calculateMotionSimilarityOptimized(motionBufferRef.current, sign.landmarks_sequence);
        return { sign, similarity: similarity * 100 };
      }).filter(Boolean) as { sign: SignLanguage; similarity: number }[];

      results.sort((a, b) => b.similarity - a.similarity);

      if (results[0] && results[0].similarity > RECOGNITION_PARAMS.DISPLAY_THRESHOLD) {
        const bestResult = results[0];
        setBestMatch(bestResult);

        if (bestResult.similarity > RECOGNITION_PARAMS.RECOGNITION_THRESHOLD) {
          const now = Date.now();
          if (consecutiveRecognitionRef.current.signId === bestResult.sign.id) {
            consecutiveRecognitionRef.current.count++;
          } else {
            consecutiveRecognitionRef.current = { signId: bestResult.sign.id, count: 1, lastTime: now };
          }

          if (consecutiveRecognitionRef.current.count >= RECOGNITION_PARAMS.CONSECUTIVE_RECOGNITION_FRAMES) {
            currentRecognizedSignRef.current = bestResult;
          }
        }
      } else {
        setBestMatch(null);
        if (Date.now() - consecutiveRecognitionRef.current.lastTime > RECOGNITION_PARAMS.CONSECUTIVE_RECOGNITION_TIMEOUT_MS) {
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
          currentRecognizedSignRef.current = null;
        }
      }

      processingRef.current = false;
    }, 0);
  };

  const compareFeaturesOptimized = (features1, features2) => {
    if (!features1 || !features2 || features1.length !== features2.length) return 0;
    return calculateFeatureSimilarity(features1, features2);
  };

  const calculateMotionSimilarityOptimized = (buffer, sequence) => {
    if (!buffer || buffer.length < 3 || !sequence || sequence.length < 3) return 0;
    const sampleRate = 1;
    const sampledBuffer = buffer.filter((_, i) => i % sampleRate === 0);
    const sampledSequence = sequence.filter((_, i) => i % sampleRate === 0);
    if (sampledBuffer.length < 2 || sampledSequence.length < 2) return 0;
    const lengthRatio = sampledBuffer.length / sampledSequence.length;
    if (lengthRatio < 0.2 || lengthRatio > 10.0) return 0;

    let bestSimilarity = 0;
    const windowSize = Math.min(sampledBuffer.length, sampledSequence.length);
    const step = Math.max(1, Math.floor(windowSize / 8));

    for (let offset = 0; offset <= sampledBuffer.length - windowSize; offset += step) {
      const segment = sampledBuffer.slice(offset, offset + windowSize);
      let frameSimilarities = [];
      for (let i = 0; i < Math.min(segment.length, sampledSequence.length); i++) {
        frameSimilarities.push(compareFramesOptimized(segment[i], sampledSequence[i]));
      }
      const avgSim = frameSimilarities.reduce((a, b) => a + b, 0) / frameSimilarities.length;
      if (avgSim > bestSimilarity) {
        bestSimilarity = avgSim;
      }
    }
    const lengthPenalty = Math.abs(lengthRatio - 1.0);
    const penaltyFactor = Math.max(0.88, 1.0 - lengthPenalty * 0.03);
    return bestSimilarity * penaltyFactor;
  };

  const calculateBodyScaleRatio = (frame1, frame2) => {
    if (!frame1.pose || !frame2.pose || frame1.pose.length < 33 || frame2.pose.length < 33) return 1.0;
    const getShoulderWidth = (pose) => {
      const { x: lx, y: ly, z: lz } = pose[11];
      const { x: rx, y: ry, z: rz } = pose[12];
      return Math.sqrt(Math.pow(lx - rx, 2) + Math.pow(ly - ry, 2) + Math.pow(lz - rz, 2));
    };
    const width1 = getShoulderWidth(frame1.pose);
    const width2 = getShoulderWidth(frame2.pose);
    if (width1 === 0 || width2 === 0) return 1.0;
    const ratio = width1 / width2;
    return (ratio < 0.5 || ratio > 2.0) ? 1.0 : ratio;
  };
  
  const compareFramesOptimized = (frame1, frame2) => {
    let totalSim = 0, count = 0;
    const compare = (f1, f2, weight) => {
      if (f1 && f2) {
        totalSim += compareFeaturesOptimized(f1, f2) * weight;
        count += weight;
      }
    };
    compare(frame1.left_hand_features, frame2.left_hand_features, 10);
    compare(frame1.right_hand_features, frame2.right_hand_features, 10);
    compare(Array.isArray(frame1.face) ? frame1.face : null, Array.isArray(frame2.face) ? frame2.face : null, 3);
    compare(frame1.pose_features, frame2.pose_features, 2);
    return count > 0 ? totalSim / count : 0;
  };

  /**
   * Clears the recognized sentence.
   */
  const clearSentence = () => {
    setRecognizedWords([]);
    setLastRecognizedId(null);
  };

  /**
   * Copies the recognized words (not the natural sentence) to the clipboard.
   */
  const copySentence = () => {
    navigator.clipboard.writeText(recognizedWords.join(' '));
  };
  
  const hasDetection = currentLandmarks && (currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand);

  return (
    <div className="space-y-6">
      <RecognizedSentenceCard
        recognizedWords={recognizedWords}
        naturalSentence={naturalSentence}
        isConverting={isConverting}
        onCopy={copySentence}
        onClear={clearSentence}
      />
      <LiveRecognitionCard
        signs={signs}
        hasDetection={hasDetection}
        bestMatch={bestMatch}
        motionBufferLength={motionBuffer.length}
      />
    </div>
  );
}


// ==================================================================
// 3. Sub-components for Readability
// ==================================================================

const RecognizedSentenceCard = ({ recognizedWords, naturalSentence, isConverting, onCopy, onClear }) => (
  <Card className="shadow-2xl shadow-primary/10 border-2 border-primary/20 bg-card">
    <CardHeader className="bg-gradient-to-r from-primary/50 to-primary/20 text-primary-foreground">
      <CardTitle className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          인식된 문장
        </span>
        <div className="flex gap-2">
          {recognizedWords.length > 0 && (
            <>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground" onClick={onCopy}><Copy className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground" onClick={onClear}><Trash2 className="w-4 h-4" /></Button>
            </>
          )}
        </div>
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-6">
      {recognizedWords.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><p className="text-lg">수화를 시작하면 여기에 표시됩니다</p></div>
      ) : (
        <div className="space-y-4">
          <div className="min-h-[80px] p-4 bg-muted/50 rounded-lg border-2 border-border">
            <p className="text-sm text-muted-foreground mb-2 font-semibold">인식된 수화 단어</p>
            <p className="text-2xl font-bold text-foreground/80 leading-relaxed">
              {recognizedWords.map((word, idx) => <span key={idx} className="inline-block mx-1 px-2 py-1 bg-background rounded-lg shadow-sm">{word}</span>)}
            </p>
          </div>
          <div className="min-h-[100px] p-6 bg-gradient-to-br from-primary/20 to-background rounded-lg border-2 border-primary/30 shadow-lg shadow-primary/10">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              <p className="text-sm text-cyan-400/90 font-semibold">AI 문장 변환</p>
              {isConverting && <span className="text-xs text-cyan-400/70 animate-pulse">변환 중...</span>}
            </div>
            <p className="text-3xl font-bold text-foreground leading-relaxed">{naturalSentence || <span className="text-muted-foreground text-xl">문장 변환 중...</span>}</p>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

const LiveRecognitionCard = ({ signs, hasDetection, bestMatch, motionBufferLength }) => (
  <Card className="shadow-2xl shadow-purple-500/10 bg-card border-border">
    <CardHeader className="bg-gradient-to-r from-purple-800/80 to-fuchsia-800/50 text-primary-foreground">
      <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5" />실시간 인식</CardTitle>
    </CardHeader>
    <CardContent className="pt-6 space-y-4">
      {!signs || signs.length === 0 ? (
        <Alert variant="destructive" className="bg-yellow-900/20 border-yellow-700/50 text-yellow-300"><AlertCircle className="h-4 w-4 text-yellow-400" /><AlertDescription>먼저 학습 모드에서 수화를 저장해주세요</AlertDescription></Alert>
      ) : !hasDetection ? (
        <Alert className="bg-sky-900/20 border-sky-700/50 text-sky-300"><AlertCircle className="h-4 w-4 text-sky-400" /><AlertDescription>카메라 앞에 서주세요</AlertDescription></Alert>
      ) : bestMatch ? (
        <Alert className={bestMatch.similarity >= 75 ? "border-4 bg-green-900/20 border-green-600/50 text-green-300" : "border-4 bg-yellow-900/20 border-yellow-700/50 text-yellow-300"}>
          <CheckCircle2 className={bestMatch.similarity >= 75 ? "h-5 w-5 text-green-400" : "h-5 w-5 text-yellow-400"} />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-4xl mb-2 text-foreground">{bestMatch.sign.name}</p>
                <p className="text-sm">정확도: {bestMatch.similarity.toFixed(1)}% {bestMatch.similarity >= 75 ? "(인식됨)" : "(감지 중...)"}</p>
              </div>
            </div>
            <Progress value={bestMatch.similarity} className="h-3 mt-3" />
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="bg-muted text-muted-foreground"><Activity className="h-4 w-4" /><AlertDescription>수화를 수행하세요...</AlertDescription></Alert>
      )}
      {motionBufferLength > 0 && (
        <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
          <div className="flex items-center justify-between text-sm mb-2">
            <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-primary/80" /><span className="text-primary-foreground/80 font-semibold">동작 버퍼</span></div>
            <span className="text-primary/80">{motionBufferLength} 프레임</span>
          </div>
          <Progress value={(motionBufferLength / 90) * 100} className="h-2 bg-primary/20" />
        </div>
      )}
    </CardContent>
  </Card>
);