import React, { useRef, useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Camera, CameraOff } from 'lucide-react';
import {
  extractHandFeatures,
  extractFaceFeatures,
  extractPoseFeatures,
  flattenHandFeatures,
  type Landmark
} from '@/lib/featureExtraction';
import type { LandmarksDetected } from '@/lib/supabaseClient';

interface WebcamCaptureProps {
  onLandmarksDetected: (landmarks: LandmarksDetected) => void;
  showLandmarks?: boolean;
  paused?: boolean; // true이면 MediaPipe 전송 중단 (카메라 화면은 유지)
}

const THEME_COLORS = {
  pose: '#FFFF00', // Bright Yellow
  poseKey: '#FF0000', // Bright Red
  leftHand: '#00FFFF', // Cyan
  leftHandKey: '#0000FF', // Blue
  rightHand: '#FF00FF', // Magenta
  rightHandKey: '#00FF00', // Green
  face: '#FFA500', // Orange
  stroke: '#FFFFFF'
};

export default function WebcamCapture({ onLandmarksDetected, showLandmarks = true, paused = false }: WebcamCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [poseDetected, setPoseDetected] = useState(false); // 가이드라인 표시 여부
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());
  // P2-10: Strict Mode 이중 초기화 방지
  const loadingRef = useRef(false);
  // P0-4: stale closure 방지 — onResults는 매 렌더마다 최신 버전으로 교체
  const onResultsRef = useRef<(results: any) => void>(() => {});
  // pause 상태를 ref로 관리 (onFrame 클로저에서 최신 값 참조)
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // poseDetected 이전 값 추적 (매 프레임 setState 방지)
  const prevPoseRef = useRef(false);

  useEffect(() => {
    // P2-10: Strict Mode 이중 초기화 방지
    if (loadingRef.current) return;
    loadingRef.current = true;

    let mounted = true;
    let holisticInstance: any = null;
    let cameraInstance: any = null;

    const loadMediaPipe = async () => {
      try {
        if (!(window as any).Holistic) {
          await loadScript('/mediapipe/holistic.js');
          await loadScript('/mediapipe/camera_utils.js');
          await loadScript('/mediapipe/drawing_utils.js');
        }

        if (!mounted) return;

        holisticInstance = new (window as any).Holistic({
          locateFile: (file: string) => `/mediapipe/${file}`
        });

        holisticInstance.setOptions({
          modelComplexity: 1,          // 0→1: 정확도 향상
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // P0-4: ref를 통해 항상 최신 onResults 호출
        holisticInstance.onResults((results: any) => onResultsRef.current(results));

        if (videoRef.current) {
          cameraInstance = new (window as any).Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && mounted && holisticInstance && !pausedRef.current) {
                try {
                  await holisticInstance.send({ image: videoRef.current });
                } catch (err) {
                  console.error('Holistic send error:', err);
                }
              }
            },
            width: 640,
            height: 480
          });
          
          await cameraInstance.start();
          if (mounted) {
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error('MediaPipe 로딩 오류:', err);
        if (mounted) {
          setError('카메라를 시작할 수 없습니다.');
          setIsLoading(false);
        }
      }
    };

    loadMediaPipe();

    return () => {
      mounted = false;
      loadingRef.current = false;
      if (cameraInstance) {
        try { cameraInstance.stop(); } catch (err) { console.error('Camera stop error:', err); }
      }
      if (holisticInstance) {
        try { holisticInstance.close(); } catch (err) { console.error('Holistic close error:', err); }
      }
    };
  }, []);

  const loadScript = (src: string) => new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });

  const onResults = (results: any) => {
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    // 포즈 감지 상태: 값이 바뀔 때만 setState (매 프레임 리렌더 방지)
    const detected = !!results.poseLandmarks;
    if (detected !== prevPoseRef.current) {
      prevPoseRef.current = detected;
      setPoseDetected(detected);
    }

    if (!canvasRef.current || !videoRef.current || !videoRef.current.videoWidth) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const leftHandRaw = results.leftHandLandmarks ? extractHandFeatures(results.leftHandLandmarks) : null;
    const rightHandRaw = results.rightHandLandmarks ? extractHandFeatures(results.rightHandLandmarks) : null;
    const leftHandFeatures = leftHandRaw ? flattenHandFeatures(leftHandRaw) : null;
    const rightHandFeatures = rightHandRaw ? flattenHandFeatures(rightHandRaw) : null;
    const faceFeatures = results.faceLandmarks ? extractFaceFeatures(results.faceLandmarks) : null;
    const poseFeatures = results.poseLandmarks ? extractPoseFeatures(results.poseLandmarks) : null;

    if (onLandmarksDetected) {
      onLandmarksDetected({
        timestamp: now,
        pose: results.poseLandmarks || null,
        leftHand: results.leftHandLandmarks || null,
        rightHand: results.rightHandLandmarks || null,
        leftHandFeatures,
        rightHandFeatures,
        face: faceFeatures,
        poseFeatures,
      });
    }

    if (showLandmarks && (window as any).drawConnectors && (window as any).drawLandmarks) {
      ctx.save();
      
      const drawUtils = (window as any);
      if (results.poseLandmarks) {
        drawUtils.drawConnectors(ctx, results.poseLandmarks, drawUtils.POSE_CONNECTIONS, { color: THEME_COLORS.pose, lineWidth: 2 });
        [0, 11, 12, 13, 14, 15, 16, 23, 24].forEach(idx => {
          if (results.poseLandmarks[idx]) {
            const lm = results.poseLandmarks[idx];
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 6, 0, 2 * Math.PI);
            ctx.fillStyle = THEME_COLORS.poseKey;
            ctx.fill();
            ctx.strokeStyle = THEME_COLORS.stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }

      if (results.leftHandLandmarks) {
        drawUtils.drawConnectors(ctx, results.leftHandLandmarks, drawUtils.HAND_CONNECTIONS, { color: THEME_COLORS.leftHand, lineWidth: 3 });
        results.leftHandLandmarks.forEach((lm: Landmark) => {
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = THEME_COLORS.leftHandKey;
          ctx.fill();
        });
      }

      if (results.rightHandLandmarks) {
        drawUtils.drawConnectors(ctx, results.rightHandLandmarks, drawUtils.HAND_CONNECTIONS, { color: THEME_COLORS.rightHand, lineWidth: 3 });
        results.rightHandLandmarks.forEach((lm: Landmark) => {
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = THEME_COLORS.rightHandKey;
          ctx.fill();
        });
      }

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        [33, 263, 1, 61, 291].forEach((idx) => {
          if (results.faceLandmarks[idx]) {
            const lm = results.faceLandmarks[idx];
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = THEME_COLORS.face;
            ctx.fill();
          }
        });
      }

      ctx.restore();
    }
  };

  // P0-4: 매 렌더마다 최신 onResults를 ref에 반영 (stale closure 방지)
  onResultsRef.current = onResults;

  return (
    <Card className="overflow-hidden shadow-2xl shadow-primary/10 border-border bg-card">
      <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          playsInline
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full transform -scale-x-100"
        />
        
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center text-foreground">
              <Camera className="w-12 h-12 mx-auto mb-4 animate-pulse text-primary" />
              <p>카메라를 시작하는 중...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center text-destructive-foreground">
              <CameraOff className="w-12 h-12 mx-auto mb-4" />
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* 포즈 가이드라인: 사람이 감지되면 자동으로 사라짐 */}
        {!isLoading && !poseDetected && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <svg
              viewBox="0 0 200 340"
              className="h-[75%] opacity-25 transition-opacity duration-500"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* 머리 */}
              <ellipse cx="100" cy="38" rx="28" ry="32" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 목 */}
              <line x1="100" y1="70" x2="100" y2="88" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 어깨 라인 */}
              <line x1="42" y1="110" x2="158" y2="110" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 몸통 */}
              <line x1="100" y1="88" x2="100" y2="200" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 왼팔 */}
              <line x1="42" y1="110" x2="20" y2="170" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              <line x1="20" y1="170" x2="10" y2="230" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 오른팔 */}
              <line x1="158" y1="110" x2="180" y2="170" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              <line x1="180" y1="170" x2="190" y2="230" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 왼다리 */}
              <line x1="100" y1="200" x2="72" y2="270" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              <line x1="72" y1="270" x2="65" y2="335" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              {/* 오른다리 */}
              <line x1="100" y1="200" x2="128" y2="270" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
              <line x1="128" y1="270" x2="135" y2="335" stroke="white" strokeWidth="3" strokeDasharray="6 4" />
            </svg>
            {/* 안내 텍스트 */}
            <div className="absolute bottom-8 left-0 right-0 text-center">
              <p className="text-white/60 text-sm font-medium tracking-wide">
                카메라 앞에 서주세요
              </p>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 space-y-2">
          <div className="bg-black/50 text-foreground px-3 py-1 rounded-full text-sm flex items-center gap-2 backdrop-blur-sm border border-white/10">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            실시간
          </div>
          <div className="bg-black/50 text-foreground px-3 py-1 rounded-lg text-xs font-mono backdrop-blur-sm border border-white/10">
            {fps} FPS
          </div>
        </div>

        {showLandmarks && (
          <div className="absolute top-4 right-4 space-y-1 text-xs">
            <div className="bg-black/50 text-foreground/80 px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm border border-white/10">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: THEME_COLORS.pose}} />
              전신
            </div>
            <div className="bg-black/50 text-foreground/80 px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm border border-white/10">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: THEME_COLORS.leftHand}}/>
              왼손
            </div>
            <div className="bg-black/50 text-foreground/80 px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm border border-white/10">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: THEME_COLORS.rightHand}}/>
              오른손
            </div>
             <div className="bg-black/50 text-foreground/80 px-2 py-1 rounded flex items-center gap-2 backdrop-blur-sm border border-white/10">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: THEME_COLORS.face}}/>
              얼굴
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}