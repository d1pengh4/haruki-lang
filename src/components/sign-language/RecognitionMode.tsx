import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, CheckCircle2, AlertCircle, TrendingUp, Activity, Trash2, Copy } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SignLanguage } from '@/lib/supabaseClient';

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

  useEffect(() => {
    if (!currentLandmarks || !signs || signs.length === 0) return;

    const timestamp = Date.now();
    
    motionBufferRef.current.push({
      timestamp,
      pose: currentLandmarks.pose ? normalizeLandmarksOptimized(currentLandmarks.pose) : null,
      left_hand: currentLandmarks.leftHand ? normalizeLandmarksOptimized(currentLandmarks.leftHand) : null,
      right_hand: currentLandmarks.rightHand ? normalizeLandmarksOptimized(currentLandmarks.rightHand) : null,
      face: currentLandmarks.face || null,
      left_hand_features: currentLandmarks.leftHandFeatures || null,
      right_hand_features: currentLandmarks.rightHandFeatures || null
    });

    const cutoffTime = timestamp - 3000;
    motionBufferRef.current = motionBufferRef.current.filter(f => f.timestamp > cutoffTime);

    setMotionBuffer(motionBufferRef.current);

    if (timestamp - lastAnalysisRef.current > 500 && motionBufferRef.current.length >= 5) {
      lastAnalysisRef.current = timestamp;
      analyzeMotion();
    }
  }, [currentLandmarks, signs]);

  const analyzeMotion = () => {
    if (processingRef.current) return;

    setTimeout(() => {
      processingRef.current = true;
      
      const results = [];

      signs.forEach(sign => {
        if (!sign.landmarks_sequence || sign.landmarks_sequence.length < 5) return;
        
        const similarity = calculateMotionSimilarityOptimized(motionBufferRef.current, sign.landmarks_sequence);
        results.push({
          sign,
          similarity: similarity * 100
        });
      });

      results.sort((a, b) => b.similarity - a.similarity);

      if (results[0] && results[0].similarity > 65) {
        setBestMatch(results[0]);
        
        if (recognitionTimeoutRef.current) {
          clearTimeout(recognitionTimeoutRef.current);
        }
        
        recognitionTimeoutRef.current = setTimeout(() => {
          if (lastRecognizedId !== results[0].sign.id) {
            setRecognizedWords(prev => [...prev, results[0].sign.name]);
            setLastRecognizedId(results[0].sign.id);
          }
        }, 600);
      } else {
        setBestMatch(null);
      }

      processingRef.current = false;
    }, 0);
  };

  const normalizeLandmarksOptimized = (landmarks) => {
    if (!landmarks || landmarks.length === 0) return [];
    
    const reference = landmarks[0];
    const normalized = new Array(landmarks.length);
    for (let i = 0; i < landmarks.length; i++) {
      normalized[i] = {
        x: landmarks[i].x - reference.x,
        y: landmarks[i].y - reference.y,
        z: landmarks[i].z - reference.z
      };
    }
    
    return normalized;
  };

  const compareFeaturesOptimized = (features1, features2) => {
    if (!features1 || !features2 || features1.length !== features2.length) return 0;
    
    let totalDiff = 0;
    for (let i = 0; i < features1.length; i++) {
      totalDiff += Math.abs(features1[i] - features2[i]);
    }
    
    const avgDiff = totalDiff / features1.length;
    return Math.max(0, 1 - avgDiff * 2);
  };

  const compareLandmarkSetsOptimized = (set1, set2) => {
    if (!set1 || !set2 || set1.length !== set2.length) return 0;

    let totalDistance = 0;
    const step = Math.max(1, Math.floor(set1.length / 10));
    
    for (let i = 0; i < set1.length; i += step) {
      const dx = set1[i].x - set2[i].x;
      const dy = set1[i].y - set2[i].y;
      const dz = set1[i].z - set2[i].z;
      
      totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const numPoints = Math.ceil(set1.length / step);
    const avgDistance = totalDistance / numPoints;
    const similarity = Math.max(0, 1 - avgDistance * 2);
    
    return similarity;
  };

  const calculateMotionSimilarityOptimized = (buffer, sequence) => {
    if (!buffer || buffer.length < 5 || !sequence || sequence.length < 5) return 0;

    const sampleRate = 2;
    const sampledBuffer = buffer.filter((_, i) => i % sampleRate === 0);
    const sampledSequence = sequence.filter((_, i) => i % sampleRate === 0);

    if (sampledBuffer.length < 3 || sampledSequence.length < 3) return 0;

    const lengthRatio = sampledBuffer.length / sampledSequence.length;
    if (lengthRatio < 0.4 || lengthRatio > 2.5) return 0;

    let bestSimilarity = 0;
    const windowSize = Math.min(sampledBuffer.length, sampledSequence.length);

    const step = Math.max(1, Math.floor(windowSize / 4));
    
    for (let offset = 0; offset <= sampledBuffer.length - windowSize; offset += step) {
      const segment = sampledBuffer.slice(offset, offset + windowSize);
      
      let frameSimilarities = [];
      
      for (let i = 0; i < Math.min(segment.length, sampledSequence.length); i++) {
        const frameSim = compareFramesOptimized(segment[i], sampledSequence[i]);
        frameSimilarities.push(frameSim);
      }

      const avgSim = frameSimilarities.reduce((a, b) => a + b, 0) / frameSimilarities.length;
      bestSimilarity = Math.max(bestSimilarity, avgSim);
    }

    return bestSimilarity;
  };

  const compareFramesOptimized = (frame1, frame2) => {
    let totalSim = 0;
    let count = 0;

    if (frame1.left_hand && frame2.left_hand) {
      const landmarkSim = compareLandmarkSetsOptimized(frame1.left_hand, frame2.left_hand);
      if (frame1.left_hand_features && frame2.left_hand_features) {
        const featureSim = compareFeaturesOptimized(frame1.left_hand_features, frame2.left_hand_features);
        totalSim += (landmarkSim * 0.6 + featureSim * 0.4) * 5;
      } else {
        totalSim += landmarkSim * 5;
      }
      count += 5;
    }

    if (frame1.right_hand && frame2.right_hand) {
      const landmarkSim = compareLandmarkSetsOptimized(frame1.right_hand, frame2.right_hand);
      if (frame1.right_hand_features && frame2.right_hand_features) {
        const featureSim = compareFeaturesOptimized(frame1.right_hand_features, frame2.right_hand_features);
        totalSim += (landmarkSim * 0.6 + featureSim * 0.4) * 5;
      } else {
        totalSim += landmarkSim * 5;
      }
      count += 5;
    }

    if (frame1.face && frame2.face) {
      const faceSim = compareLandmarkSetsOptimized(frame1.face, frame2.face);
      totalSim += faceSim * 2;
      count += 2;
    }

    if (count === 0 && frame1.pose && frame2.pose) {
      totalSim += compareLandmarkSetsOptimized(frame1.pose, frame2.pose);
      count += 1;
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