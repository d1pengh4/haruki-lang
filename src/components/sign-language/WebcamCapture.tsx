import React, { useRef, useEffect, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import {
  extractHandFeatures,
  extractFaceFeatures,
  extractPoseFeatures,
  extractInterHandFeatures,
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
  pose: 'rgba(148,163,184,0.45)',     // slate-300 — 전신 뼈대 (은은하게)
  poseKey: 'rgba(129,140,248,0.9)',   // indigo-400 — 주요 관절
  leftHand: 'rgba(34,211,238,0.8)',   // cyan-400 — 왼손 뼈대
  leftHandKey: 'rgba(6,182,212,1)',   // cyan-500 — 왼손 관절
  rightHand: 'rgba(167,139,250,0.8)',  // violet-400 — 오른손 뼈대
  rightHandKey: 'rgba(139,92,246,1)', // violet-500 — 오른손 관절
  face: 'rgba(251,191,36,0.45)',      // amber-400 — 얼굴 (최소화)
  stroke: 'rgba(255,255,255,0.7)'
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
    const interHandFeatures = results.poseLandmarks ? extractInterHandFeatures(results.poseLandmarks) : null;

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
        interHandFeatures,
      });
    }

    if (showLandmarks && (window as any).drawConnectors && (window as any).drawLandmarks) {
      ctx.save();
      
      const drawUtils = (window as any);
      if (results.poseLandmarks) {
        drawUtils.drawConnectors(ctx, results.poseLandmarks, drawUtils.POSE_CONNECTIONS, { color: THEME_COLORS.pose, lineWidth: 1.5 });
        [0, 11, 12, 13, 14, 15, 16, 23, 24].forEach(idx => {
          if (results.poseLandmarks[idx]) {
            const lm = results.poseLandmarks[idx];
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = THEME_COLORS.poseKey;
            ctx.fill();
          }
        });
      }

      if (results.leftHandLandmarks) {
        drawUtils.drawConnectors(ctx, results.leftHandLandmarks, drawUtils.HAND_CONNECTIONS, { color: THEME_COLORS.leftHand, lineWidth: 2 });
        results.leftHandLandmarks.forEach((lm: Landmark) => {
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3.5, 0, 2 * Math.PI);
          ctx.fillStyle = THEME_COLORS.leftHandKey;
          ctx.fill();
        });
      }

      if (results.rightHandLandmarks) {
        drawUtils.drawConnectors(ctx, results.rightHandLandmarks, drawUtils.HAND_CONNECTIONS, { color: THEME_COLORS.rightHand, lineWidth: 2 });
        results.rightHandLandmarks.forEach((lm: Landmark) => {
          ctx.beginPath();
          ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3.5, 0, 2 * Math.PI);
          ctx.fillStyle = THEME_COLORS.rightHandKey;
          ctx.fill();
        });
      }

      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        [33, 263, 1, 61, 291].forEach((idx) => {
          if (results.faceLandmarks[idx]) {
            const lm = results.faceLandmarks[idx];
            ctx.beginPath();
            ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
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
    <div className="overflow-hidden w-full h-full">
      <div className="relative bg-black w-full h-full">
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
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Camera className="w-7 h-7 text-indigo-400 animate-pulse" />
              </div>
              <p className="text-white/50 text-sm">카메라를 시작하는 중...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <CameraOff className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-white/50 text-sm">{error}</p>
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

        {/* 상단 좌측: 실시간 + FPS 단일 pill */}
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
          </span>
          <span className="text-xs text-white/60 font-medium">실시간</span>
          <span className="text-xs text-white/25 font-mono">{fps}fps</span>
        </div>

        {/* 상단 우측: 랜드마크 범례 단일 pill */}
        {showLandmarks && (
          <div className="absolute top-3 right-3 flex items-center gap-2.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{backgroundColor: THEME_COLORS.leftHandKey}} />
              <span className="text-[10px] text-white/40">왼손</span>
            </span>
            <span className="w-px h-3 bg-white/10" />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{backgroundColor: THEME_COLORS.rightHandKey}} />
              <span className="text-[10px] text-white/40">오른손</span>
            </span>
            <span className="w-px h-3 bg-white/10" />
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{backgroundColor: THEME_COLORS.poseKey}} />
              <span className="text-[10px] text-white/40">전신</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}