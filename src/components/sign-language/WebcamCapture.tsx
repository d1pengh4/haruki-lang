import React, { useRef, useEffect, useState } from 'react';
import { Card } from "@/components/ui/card";
import { Camera, CameraOff } from 'lucide-react';

const calculateHandFeatures = (handLandmarks) => {
  if (!handLandmarks || handLandmarks.length < 21) return null;
  
  const features = [];
  const palmCenter = handLandmarks[0];
  const fingerTips = [4, 8, 12, 16, 20];
  
  fingerTips.forEach(tip => {
    const dx = handLandmarks[tip].x - palmCenter.x;
    const dy = handLandmarks[tip].y - palmCenter.y;
    const dz = handLandmarks[tip].z - palmCenter.z;
    features.push(Math.sqrt(dx*dx + dy*dy + dz*dz));
  });
  
  const fingerBones = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20]
  ];
  
  fingerBones.forEach(bones => {
    for (let i = 0; i < bones.length - 2; i++) {
      const p1 = handLandmarks[bones[i]];
      const p2 = handLandmarks[bones[i + 1]];
      const p3 = handLandmarks[bones[i + 2]];
      
      const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: p1.z - p2.z };
      const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: p3.z - p2.z };
      
      const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
      const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
      const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);
      
      const angle = Math.acos(dot / (len1 * len2));
      features.push(angle);
    }
  });
  
  for (let i = 0; i < fingerTips.length; i++) {
    for (let j = i + 1; j < fingerTips.length; j++) {
      const p1 = handLandmarks[fingerTips[i]];
      const p2 = handLandmarks[fingerTips[j]];
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dz = p1.z - p2.z;
      features.push(Math.sqrt(dx*dx + dy*dy + dz*dz));
    }
  }
  
  const p0 = handLandmarks[0];
  const p5 = handLandmarks[5];
  const p17 = handLandmarks[17];
  const palmArea = Math.abs(
    (p5.x - p0.x) * (p17.y - p0.y) - (p17.x - p0.x) * (p5.y - p0.y)
  ) / 2;
  features.push(palmArea);
  
  return features;
};

// 얼굴에서 주요 랜드마크 5개 추출 (양쪽 눈, 코, 입 양 끝)
const extractKeyFaceLandmarks = (faceLandmarks) => {
  if (!faceLandmarks || faceLandmarks.length < 468) return null;
  
  // MediaPipe Face Mesh 주요 포인트
  const keyIndices = [
    33,   // 왼쪽 눈 중앙
    263,  // 오른쪽 눈 중앙
    1,    // 코 끝
    61,   // 입 왼쪽 끝
    291   // 입 오른쪽 끝
  ];
  
  return keyIndices.map(idx => ({
    x: faceLandmarks[idx].x,
    y: faceLandmarks[idx].y,
    z: faceLandmarks[idx].z
  }));
};

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
    let animationId = null;

    const loadMediaPipe = async () => {
      try {
        if (!window.Holistic) {
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
        }

        if (!mounted) return;

        const holisticInstance = new window.Holistic({
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
          const cameraInstance = new window.Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && mounted) {
                await holisticInstance.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          
          await cameraInstance.start();
          setIsLoading(false);
        }
      } catch (err) {
        console.error('MediaPipe 로딩 오류:', err);
        setError('카메라를 시작할 수 없습니다.');
        setIsLoading(false);
      }
    };

    loadMediaPipe();

    return () => {
      mounted = false;
      if (animationId) {
        cancelAnimationFrame(animationId);
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

    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const leftHandFeatures = results.leftHandLandmarks ? calculateHandFeatures(results.leftHandLandmarks) : null;
    const rightHandFeatures = results.rightHandLandmarks ? calculateHandFeatures(results.rightHandLandmarks) : null;
    const keyFaceLandmarks = results.faceLandmarks ? extractKeyFaceLandmarks(results.faceLandmarks) : null;

    const detectedLandmarks = {
      pose: results.poseLandmarks || null,
      leftHand: results.leftHandLandmarks || null,
      rightHand: results.rightHandLandmarks || null,
      leftHandFeatures: leftHandFeatures,
      rightHandFeatures: rightHandFeatures,
      face: keyFaceLandmarks
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

      // 얼굴 주요 랜드마크 그리기
      if (keyFaceLandmarks) {
        keyFaceLandmarks.forEach((landmark, idx) => {
          ctx.beginPath();
          ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 4, 0, 2 * Math.PI);
          ctx.fillStyle = '#FFA500';
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
          ctx.stroke();
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