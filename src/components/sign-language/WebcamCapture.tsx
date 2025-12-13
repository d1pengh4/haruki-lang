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

export default function WebcamCapture({ onLandmarksDetected, showLandmarks = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  useEffect(() => {
    let mounted = true;
    let holisticInstance = null;
    let cameraInstance = null;

    const loadMediaPipe = async () => {
      try {
        if (!window.Holistic) {
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        }

        if (!mounted) return;

        holisticInstance = new window.Holistic({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
          }
        });

        holisticInstance.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        holisticInstance.onResults(onResults);

        if (videoRef.current) {
          cameraInstance = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && mounted && holisticInstance) {
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
      if (cameraInstance) {
        try {
          cameraInstance.stop();
        } catch (err) {
          console.error('Camera stop error:', err);
        }
      }
      if (holisticInstance) {
        try {
          holisticInstance.close();
        } catch (err) {
          console.error('Holistic close error:', err);
        }
      }
    };
  }, []);

  const loadScript = (src: string) => {
    return new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const onResults = (results) => {
    frameCountRef.current++;
    const now = Date.now();
    if (now - lastTimeRef.current >= 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      lastTimeRef.current = now;
    }

    if (!canvasRef.current || !videoRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // 비디오가 준비되었는지 확인
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      return;
    }
    
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 비디오 프레임 그리기
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // 신체 크기 기준값 계산 (어깨 너비)
    let bodyScale = null;
    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      const leftShoulder = results.poseLandmarks[11];
      const rightShoulder = results.poseLandmarks[12];
      const dx = leftShoulder.x - rightShoulder.x;
      const dy = leftShoulder.y - rightShoulder.y;
      const dz = leftShoulder.z - rightShoulder.z;
      bodyScale = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // 새로운 위치/크기/회전 불변 특징 추출 (신체 크기 기준값 포함)
    const leftHandFeatureObj = results.leftHandLandmarks ? extractHandFeatures(results.leftHandLandmarks, bodyScale) : null;
    const rightHandFeatureObj = results.rightHandLandmarks ? extractHandFeatures(results.rightHandLandmarks, bodyScale) : null;
    const faceFeatures = results.faceLandmarks ? extractFaceFeatures(results.faceLandmarks) : null;
    const poseFeatures = results.poseLandmarks ? extractPoseFeatures(results.poseLandmarks) : null;

    // 특징을 배열로 변환
    const leftHandFeatures = leftHandFeatureObj ? flattenHandFeatures(leftHandFeatureObj) : null;
    const rightHandFeatures = rightHandFeatureObj ? flattenHandFeatures(rightHandFeatureObj) : null;

    const detectedLandmarks = {
      timestamp: Date.now(),
      pose: results.poseLandmarks || null,
      leftHand: results.leftHandLandmarks || null,
      rightHand: results.rightHandLandmarks || null,
      leftHandFeatures: leftHandFeatures,
      rightHandFeatures: rightHandFeatures,
      face: faceFeatures,
      poseFeatures: poseFeatures
    };

    if (onLandmarksDetected) {
      onLandmarksDetected(detectedLandmarks);
    }

    if (showLandmarks && window.drawConnectors && window.drawLandmarks) {
      ctx.save();
      
      if (results.poseLandmarks) {
        window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2
        });
        
        const keyPoints = [0, 11, 12, 13, 14, 15, 16, 23, 24];
        keyPoints.forEach(idx => {
          if (results.poseLandmarks[idx]) {
            const landmark = results.poseLandmarks[idx];
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#FF0000';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }

      if (results.leftHandLandmarks) {
        window.drawConnectors(ctx, results.leftHandLandmarks, window.HAND_CONNECTIONS, {
          color: '#00FFFF',
          lineWidth: 3
        });
        
        results.leftHandLandmarks.forEach((landmark, idx) => {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = idx === 0 ? '#FF0000' : '#0000FF';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      if (results.rightHandLandmarks) {
        window.drawConnectors(ctx, results.rightHandLandmarks, window.HAND_CONNECTIONS, {
          color: '#FFFF00',
          lineWidth: 3
        });
        
        results.rightHandLandmarks.forEach((landmark, idx) => {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, 2 * Math.PI);
          ctx.fillStyle = idx === 0 ? '#FF0000' : '#FF00FF';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // 얼굴 주요 랜드마크 그리기 (주요 포인트만)
      if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        // 주요 얼굴 포인트 인덱스: 왼쪽 눈, 오른쪽 눈, 코, 입 왼쪽, 입 오른쪽
        const keyFaceIndices = [33, 263, 1, 61, 291];
        keyFaceIndices.forEach((idx) => {
          if (results.faceLandmarks[idx]) {
            const landmark = results.faceLandmarks[idx];
            ctx.beginPath();
            ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fillStyle = '#FFA500';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      }

      ctx.restore();
    }
  };

  return (
    <Card className="overflow-hidden shadow-xl">
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
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="text-center text-white">
              <Camera className="w-12 h-12 mx-auto mb-4 animate-pulse" />
              <p>카메라를 시작하는 중...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
            <div className="text-center text-white">
              <CameraOff className="w-12 h-12 mx-auto mb-4" />
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="absolute top-4 left-4 space-y-2">
          <div className="bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            실시간
          </div>
          <div className="bg-black bg-opacity-70 text-white px-3 py-1 rounded-lg text-xs font-mono">
            {fps} FPS
          </div>
        </div>

        {showLandmarks && (
          <div className="absolute top-4 right-4 space-y-1 text-xs">
            <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              전신
            </div>
            <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded flex items-center gap-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full" />
              왼손
            </div>
            <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              오른손
            </div>
            <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full" />
              얼굴
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}