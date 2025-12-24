import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, CheckCircle2, AlertCircle, TrendingUp, Activity, Trash2, Copy } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SignLanguage } from '@/lib/supabaseClient';
import { calculateFeatureSimilarity } from '@/lib/featureExtraction';

interface RecognitionModeProps {
  currentLandmarks: any;
  signs: SignLanguage[];
}

export default function RecognitionMode({ currentLandmarks, signs }: RecognitionModeProps) {
  const [bestMatch, setBestMatch] = useState(null);
  const [motionBuffer, setMotionBuffer] = useState([]);
  const [recognizedWords, setRecognizedWords] = useState([]);
  const [lastRecognizedId, setLastRecognizedId] = useState(null);
  const motionBufferRef = useRef([]);
  const lastAnalysisRef = useRef(0);
  const processingRef = useRef(false);
  const recognitionTimeoutRef = useRef(null);
  const consecutiveRecognitionRef = useRef({ signId: null, count: 0, lastTime: 0 });
  const currentRecognizedSignRef = useRef(null); // 현재 인식 중인 수화 저장
  const neutralPoseCountRef = useRef(0); // 중립 포즈 연속 감지 횟수

  useEffect(() => {
    if (!currentLandmarks || !signs || signs.length === 0) return;

    const timestamp = Date.now();
    
    // 이미 특징 추출된 데이터 저장 (정규화 필요 없음)
    motionBufferRef.current.push({
      timestamp,
      pose: currentLandmarks.pose || null,
      left_hand: currentLandmarks.leftHand || null,
      right_hand: currentLandmarks.rightHand || null,
      face: currentLandmarks.face || null,
      left_hand_features: currentLandmarks.leftHandFeatures || null,
      right_hand_features: currentLandmarks.rightHandFeatures || null,
      pose_features: currentLandmarks.poseFeatures || null
    });

    const cutoffTime = timestamp - 3000;
    motionBufferRef.current = motionBufferRef.current.filter(f => f.timestamp > cutoffTime);

    setMotionBuffer(motionBufferRef.current);

    // 더 자주 분석하여 동작을 빠르게 캡쳐 (300ms 주기, 최소 15프레임)
    // 초기 로딩 시 충분한 데이터 확보 후 분석 시작
    if (timestamp - lastAnalysisRef.current > 300 && motionBufferRef.current.length >= 15) {
      lastAnalysisRef.current = timestamp;
      analyzeMotion();
    }
  }, [currentLandmarks, signs]);

  // 중립 포즈 감지 (손을 내린 상태) - 개선된 버전
  const isNeutralPose = (landmarks) => {
    if (!landmarks) return false;

    // 손이 감지되지 않으면 중립 포즈로 간주
    const hasLeftHand = landmarks.leftHand && landmarks.leftHand.length > 0;
    const hasRightHand = landmarks.rightHand && landmarks.rightHand.length > 0;

    // 양손이 모두 감지되지 않으면 중립 포즈
    if (!hasLeftHand && !hasRightHand) return true;

    // 포즈 랜드마크가 있어야 기준점 확인 가능
    if (!landmarks.pose || landmarks.pose.length < 33) return false;

    const leftShoulder = landmarks.pose[11]; // 왼쪽 어깨
    const rightShoulder = landmarks.pose[12]; // 오른쪽 어깨
    const leftHip = landmarks.pose[23]; // 왼쪽 엉덩이
    const rightHip = landmarks.pose[24]; // 오른쪽 엉덩이

    // MediaPipe 좌표계: y가 클수록 아래쪽 (0.0 = 위, 1.0 = 아래)
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;

    // 상체 길이를 고려한 동적 임계값 (엉덩이와 어깨 사이 50% 지점으로 완화)
    const torsoLength = hipY - shoulderY;
    const neutralThreshold = shoulderY + (torsoLength * 0.5);

    let allHandsBelow = true;

    if (hasLeftHand) {
      const leftWrist = landmarks.leftHand[0];
      const visibility = leftWrist.visibility !== undefined ? leftWrist.visibility : 1.0;

      // 가시성이 낮거나(0.5 이하로 완화) 손목이 임계값보다 위에 있으면 중립 포즈 아님
      if (visibility < 0.5 || leftWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }

    if (hasRightHand) {
      const rightWrist = landmarks.rightHand[0];
      const visibility = rightWrist.visibility !== undefined ? rightWrist.visibility : 1.0;

      if (visibility < 0.5 || rightWrist.y <= neutralThreshold) {
        allHandsBelow = false;
      }
    }

    return allHandsBelow;
  };

  // 움직임 변화량 계산 (정적 상태 감지)
  const calculateMotionVariance = (buffer) => {
    if (buffer.length < 3) return 0;

    let totalVariance = 0;
    let count = 0;

    for (let i = 1; i < buffer.length; i++) {
      const prev = buffer[i - 1];
      const curr = buffer[i];

      // 손 특징 변화량 계산
      if (prev.left_hand_features && curr.left_hand_features) {
        const variance = prev.left_hand_features.reduce((sum, val, idx) => {
          return sum + Math.abs(val - (curr.left_hand_features[idx] || 0));
        }, 0);
        totalVariance += variance;
        count++;
      }

      if (prev.right_hand_features && curr.right_hand_features) {
        const variance = prev.right_hand_features.reduce((sum, val, idx) => {
          return sum + Math.abs(val - (curr.right_hand_features[idx] || 0));
        }, 0);
        totalVariance += variance;
        count++;
      }
    }

    return count > 0 ? totalVariance / count : 0;
  };

  const analyzeMotion = () => {
    if (processingRef.current) return;

    setTimeout(() => {
      processingRef.current = true;
      
      // 현재 프레임의 중립 포즈 확인
      const latestFrame = motionBufferRef.current[motionBufferRef.current.length - 1];
      const isNeutral = isNeutralPose({
        leftHand: latestFrame?.left_hand,
        rightHand: latestFrame?.right_hand,
        pose: latestFrame?.pose
      });

      // 중립 포즈가 감지되면
      if (isNeutral) {
        neutralPoseCountRef.current++;

        // 중립 포즈가 연속으로 3프레임 이상 감지되면 (약 0.9초) - 반응성 개선
        if (neutralPoseCountRef.current >= 3 && currentRecognizedSignRef.current) {
          // 현재 인식 중인 수화를 문장에 추가
          const signToAdd = currentRecognizedSignRef.current;
          if (lastRecognizedId !== signToAdd.sign.id) {
            setRecognizedWords(prev => [...prev, signToAdd.sign.name]);
            setLastRecognizedId(signToAdd.sign.id);
          }

          // 상태 리셋
          currentRecognizedSignRef.current = null;
          setBestMatch(null);
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
          neutralPoseCountRef.current = 0;
          processingRef.current = false;
          return;
        }

        // 중립 포즈일 때는 새로운 수화 인식 차단
        setBestMatch(null);
        processingRef.current = false;
        return;
      } else {
        // 중립 포즈가 아니면 카운트 리셋
        neutralPoseCountRef.current = 0;
      }
      
      // 버퍼 최소 요구사항 체크 (초기 노이즈 방지)
      if (motionBufferRef.current.length < 15) {
        // 데이터가 충분하지 않으면 인식하지 않음
        setBestMatch(null);
        currentRecognizedSignRef.current = null;
        consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
        processingRef.current = false;
        return;
      }

      // 움직임 변화량 확인 (정적 상태 감지)
      const motionVariance = calculateMotionVariance(motionBufferRef.current);
      const hasSignificantMotion = motionVariance > 0.008; // 임계값: 명확한 움직임만 감지

      // 정적 상태면 인식하지 않음
      if (!hasSignificantMotion) {
        // 움직임이 거의 없으면 인식하지 않음
        setBestMatch(null);
        currentRecognizedSignRef.current = null;
        consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
        processingRef.current = false;
        return;
      }

      const results = [];

      signs.forEach(sign => {
        if (!sign.landmarks_sequence || sign.landmarks_sequence.length < 5) return;

        const similarity = calculateMotionSimilarityOptimized(motionBufferRef.current, sign.landmarks_sequence, sign.name === '운전면허');
        results.push({
          sign,
          similarity: similarity * 100
        });
      });

      results.sort((a, b) => b.similarity - a.similarity);

      // 디버깅: 상위 3개 결과 출력
      if (results.length > 0) {
        console.log('🔍 인식 결과:', results.slice(0, 3).map(r => `${r.sign.name}: ${r.similarity.toFixed(1)}%`).join(', '));
      }

      // 새로운 특징 기반 매칭은 더 정확하므로 임계값 상향 (85% 이상)
      if (results[0] && results[0].similarity > 85) {
        const bestResult = results[0];
        const now = Date.now();

        // 연속 인식 확인
        if (consecutiveRecognitionRef.current.signId === bestResult.sign.id) {
          consecutiveRecognitionRef.current.count++;
          consecutiveRecognitionRef.current.lastTime = now;
        } else {
          // 다른 수화로 바뀌면 리셋
          consecutiveRecognitionRef.current = {
            signId: bestResult.sign.id,
            count: 1,
            lastTime: now
          };
        }

        setBestMatch(bestResult);
        
        // 연속으로 2번 이상 인식되면 현재 인식 중인 수화로 저장
        // (중립 포즈가 감지되면 문장에 추가됨)
        const isConsecutiveEnough = consecutiveRecognitionRef.current.count >= 2;
        
        if (isConsecutiveEnough) {
          // 현재 인식 중인 수화로 저장 (중립 포즈 감지 시 사용)
          currentRecognizedSignRef.current = bestResult;
        }
      } else {
        setBestMatch(null);
        // 임계값 미만이면 현재 인식 중인 수화도 리셋
        if (consecutiveRecognitionRef.current.lastTime > 0 && 
            Date.now() - consecutiveRecognitionRef.current.lastTime > 1000) {
          consecutiveRecognitionRef.current = { signId: null, count: 0, lastTime: 0 };
          currentRecognizedSignRef.current = null;
        }
      }

      processingRef.current = false;
    }, 0);
  };

  // 특징 비교 함수 (코사인 유사도 사용)
  const compareFeaturesOptimized = (features1, features2) => {
    if (!features1 || !features2 || features1.length !== features2.length) return 0;
    return calculateFeatureSimilarity(features1, features2);
  };

  const calculateMotionSimilarityOptimized = (buffer, sequence, debugMode = false) => {
    if (!buffer || buffer.length < 3 || !sequence || sequence.length < 3) return 0;

    // 샘플링 레이트를 낮춰 더 많은 프레임 분석 (더 정확한 매칭)
    const sampleRate = 1; // 모든 프레임 사용 (이전: 2프레임마다)
    const sampledBuffer = buffer.filter((_, i) => i % sampleRate === 0);
    const sampledSequence = sequence.filter((_, i) => i % sampleRate === 0);

    if (sampledBuffer.length < 2 || sampledSequence.length < 2) return 0;

    // 길이 비율 범위를 넓혀 더 다양한 동작 속도 지원
    const lengthRatio = sampledBuffer.length / sampledSequence.length;

    if (debugMode) {
      console.log('🔬 운전면허 디버깅:');
      console.log('  버퍼 길이:', sampledBuffer.length, '학습 데이터 길이:', sampledSequence.length, '비율:', lengthRatio.toFixed(2));
    }

    if (lengthRatio < 0.3 || lengthRatio > 3.0) {
      if (debugMode) console.log('  ❌ 길이 비율 범위 밖:', lengthRatio.toFixed(2));
      return 0;
    }

    let bestSimilarity = 0;
    let bestOffset = 0;
    const windowSize = Math.min(sampledBuffer.length, sampledSequence.length);

    const step = Math.max(1, Math.floor(windowSize / 4));

    for (let offset = 0; offset <= sampledBuffer.length - windowSize; offset += step) {
      const segment = sampledBuffer.slice(offset, offset + windowSize);

      let frameSimilarities = [];

      for (let i = 0; i < Math.min(segment.length, sampledSequence.length); i++) {
        const frameSim = compareFramesOptimized(segment[i], sampledSequence[i], debugMode && offset === 0 && i === 0);
        frameSimilarities.push(frameSim);
      }

      const avgSim = frameSimilarities.reduce((a, b) => a + b, 0) / frameSimilarities.length;
      if (avgSim > bestSimilarity) {
        bestSimilarity = avgSim;
        bestOffset = offset;
      }
    }

    if (debugMode) {
      console.log('  최고 유사도:', (bestSimilarity * 100).toFixed(1) + '% (오프셋:', bestOffset + ')');
    }

    return bestSimilarity;
  };

  // 신체 비율 차이 보정을 위한 스케일 계산
  const calculateBodyScaleRatio = (frame1, frame2) => {
    // 어깨 너비를 기준으로 신체 크기 비율 계산
    if (!frame1.pose || !frame2.pose || frame1.pose.length < 33 || frame2.pose.length < 33) {
      return 1.0; // 포즈 정보가 없으면 보정하지 않음
    }

    const getShoulderWidth = (pose) => {
      const leftShoulder = pose[11];
      const rightShoulder = pose[12];
      const dx = leftShoulder.x - rightShoulder.x;
      const dy = leftShoulder.y - rightShoulder.y;
      const dz = leftShoulder.z - rightShoulder.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    };

    const width1 = getShoulderWidth(frame1.pose);
    const width2 = getShoulderWidth(frame2.pose);

    if (width1 === 0 || width2 === 0) return 1.0;

    // 비율이 너무 차이나면 보정하지 않음 (다른 사람일 가능성)
    const ratio = width1 / width2;
    if (ratio < 0.5 || ratio > 2.0) return 1.0;

    return ratio;
  };

  const compareFramesOptimized = (frame1, frame2, debugMode = false) => {
    let totalSim = 0;
    let count = 0;

    // 신체 비율 차이 보정 (선택적)
    const bodyScaleRatio = calculateBodyScaleRatio(frame1, frame2);

    // 왼손 특징 비교 (가중치 10 - 매우 중요)
    // 손 특징은 이미 손 크기로 정규화되어 있어 체구와 무관
    if (frame1.left_hand_features && frame2.left_hand_features) {
      const featureSim = compareFeaturesOptimized(frame1.left_hand_features, frame2.left_hand_features);
      if (debugMode && featureSim > 0.5) {
        console.log('  왼손 특징 유사도:', (featureSim * 100).toFixed(1) + '%',
                    'len1:', frame1.left_hand_features.length,
                    'len2:', frame2.left_hand_features.length);
      }
      totalSim += featureSim * 10;
      count += 10;
    } else if (frame1.left_hand_features || frame2.left_hand_features) {
      // 한쪽만 손이 있으면 페널티 (0.3 유사도로 처리)
      if (debugMode) {
        console.log('  왼손 특징 없음 (페널티):', 'frame1:', !!frame1.left_hand_features, 'frame2:', !!frame2.left_hand_features);
      }
      totalSim += 0.3 * 10;
      count += 10;
    }

    // 오른손 특징 비교 (가중치 10 - 매우 중요)
    if (frame1.right_hand_features && frame2.right_hand_features) {
      const featureSim = compareFeaturesOptimized(frame1.right_hand_features, frame2.right_hand_features);
      if (debugMode && featureSim > 0.5) {
        console.log('  오른손 특징 유사도:', (featureSim * 100).toFixed(1) + '%');
      }
      totalSim += featureSim * 10;
      count += 10;
    } else if (frame1.right_hand_features || frame2.right_hand_features) {
      // 한쪽만 손이 있으면 페널티 (0.3 유사도로 처리)
      if (debugMode) {
        console.log('  오른손 특징 없음 (페널티):', 'frame1:', !!frame1.right_hand_features, 'frame2:', !!frame2.right_hand_features);
      }
      totalSim += 0.3 * 10;
      count += 10;
    }

    // 얼굴 특징 비교 (가중치 3)
    // 얼굴 특징도 얼굴 크기로 정규화되어 있어 체구와 무관
    if (frame1.face && frame2.face && Array.isArray(frame1.face) && Array.isArray(frame2.face)) {
      const faceSim = compareFeaturesOptimized(frame1.face, frame2.face);
      totalSim += faceSim * 3;
      count += 3;
    }

    // 전신 포즈 특징 비교 (가중치 2)
    // 포즈 특징은 어깨 너비로 정규화되어 있어 체구와 무관
    if (frame1.pose_features && frame2.pose_features) {
      const poseSim = compareFeaturesOptimized(frame1.pose_features, frame2.pose_features);
      totalSim += poseSim * 2;
      count += 2;
    }

    return count > 0 ? totalSim / count : 0;
  };

  const clearSentence = () => {
    setRecognizedWords([]);
    setLastRecognizedId(null);
  };

  const copySentence = () => {
    const sentence = recognizedWords.join(' ');
    navigator.clipboard.writeText(sentence);
  };

  const hasDetection = currentLandmarks && (currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand);

  return (
    <div className="space-y-6">
      <Card className="shadow-xl border-4 border-indigo-200">
        <CardHeader className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              인식된 문장
            </span>
            <div className="flex gap-2">
              {recognizedWords.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-white hover:bg-opacity-20"
                    onClick={copySentence}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-white hover:bg-white hover:bg-opacity-20"
                    onClick={clearSentence}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {recognizedWords.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">수화를 시작하면 여기에 표시됩니다</p>
            </div>
          ) : (
            <div className="min-h-[120px] p-6 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-indigo-200">
              <p className="text-3xl font-bold text-gray-800 leading-relaxed">
                {recognizedWords.map((word, idx) => (
                  <span key={idx} className="inline-block mx-1 px-2 py-1 bg-white rounded-lg shadow-sm">
                    {word}
                  </span>
                ))}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-xl">
        <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-600 text-white">
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            실시간 인식
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {signs.length === 0 ? (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                먼저 학습 모드에서 수화를 저장해주세요
              </AlertDescription>
            </Alert>
          ) : !hasDetection ? (
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                카메라 앞에 서주세요
              </AlertDescription>
            </Alert>
          ) : bestMatch ? (
            <Alert className="bg-green-50 border-green-200 border-4">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-900 font-bold text-4xl mb-2">{bestMatch.sign.name}</p>
                    <p className="text-green-700 text-sm">
                      정확도: {bestMatch.similarity.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <Progress value={bestMatch.similarity} className="h-3 mt-3" />
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-gray-50 border-gray-200">
              <Activity className="h-4 w-4 text-gray-600" />
              <AlertDescription className="text-gray-800">
                수화를 수행하세요...
              </AlertDescription>
            </Alert>
          )}

          {motionBuffer.length > 0 && (
            <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between text-sm mb-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-600" />
                  <span className="text-purple-900 font-semibold">동작 버퍼</span>
                </div>
                <span className="text-purple-700">{motionBuffer.length} 프레임</span>
              </div>
              <Progress value={(motionBuffer.length / 90) * 100} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}