import React, { useRef, useEffect, useState } from 'react';
import { extractHandFeatures, extractPoseFeatures, flattenHandFeatures } from '@/lib/featureExtraction';

interface VideoProcessorProps {
  videoFile: File | null;
  onLandmarksExtracted: (sequence: any[]) => void;
  onProgress: (progress: number) => void;
  onComplete: () => void;
  onError: (error: string) => void;
}

export default function VideoProcessor({
  videoFile,
  onLandmarksExtracted,
  onProgress,
  onComplete,
  onError
}: VideoProcessorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holisticRef = useRef<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedSequence, setRecordedSequence] = useState<any[]>([]);
  const recordedSequenceRef = useRef<any[]>([]); // state와 동기화할 ref

  useEffect(() => {
    if (!videoFile) return;

    const videoUrl = URL.createObjectURL(videoFile);
    if (videoRef.current) {
      videoRef.current.src = videoUrl;
    }

    return () => {
      URL.revokeObjectURL(videoUrl);
    };
  }, [videoFile]);

  useEffect(() => {
    // MediaPipe Holistic 초기화
    if (window.Holistic) {
      holisticRef.current = new window.Holistic({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holisticRef.current.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      holisticRef.current.onResults((results: any) => {
        handleResults(results);
      });
    }

    return () => {
      if (holisticRef.current) {
        holisticRef.current.close();
      }
    };
  }, []);

  const handleResults = (results: any) => {
    // 신체 크기 기준값 계산 (어깨 너비) - WebcamCapture와 동일
    let bodyScale = null;
    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      const leftShoulder = results.poseLandmarks[11];
      const rightShoulder = results.poseLandmarks[12];
      const dx = leftShoulder.x - rightShoulder.x;
      const dy = leftShoulder.y - rightShoulder.y;
      const dz = leftShoulder.z - rightShoulder.z;
      bodyScale = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    // WebcamCapture와 동일하게 bodyScale을 전달
    const leftHandFeaturesObj = results.leftHandLandmarks
      ? extractHandFeatures(results.leftHandLandmarks, bodyScale)
      : null;
    const rightHandFeaturesObj = results.rightHandLandmarks
      ? extractHandFeatures(results.rightHandLandmarks, bodyScale)
      : null;
    const poseFeatures = results.poseLandmarks
      ? extractPoseFeatures(results.poseLandmarks)
      : null;

    // 특징 객체를 배열로 평탄화
    const leftHandFeatures = leftHandFeaturesObj ? flattenHandFeatures(leftHandFeaturesObj) : null;
    const rightHandFeatures = rightHandFeaturesObj ? flattenHandFeatures(rightHandFeaturesObj) : null;

    const timestamp = videoRef.current?.currentTime || 0;

    const landmarkData = {
      timestamp: timestamp * 1000,
      pose: results.poseLandmarks || null,
      left_hand: results.leftHandLandmarks || null,
      right_hand: results.rightHandLandmarks || null,
      face: results.faceLandmarks || null,
      left_hand_features: leftHandFeatures,
      right_hand_features: rightHandFeatures,
      pose_features: poseFeatures
    };

    // 디버깅: 손 감지 확인
    if (!leftHandFeatures && !rightHandFeatures) {
      console.warn(`⚠️  프레임 ${timestamp.toFixed(2)}s: 손이 감지되지 않음`);
    } else {
      console.log(`✓ 프레임 ${timestamp.toFixed(2)}s: 왼손=${leftHandFeatures ? '✓' : '✗'}, 오른손=${rightHandFeatures ? '✓' : '✗'}`);
    }

    // ref에도 저장 (state는 비동기이므로 processVideo에서 사용 불가)
    recordedSequenceRef.current.push(landmarkData);
    setRecordedSequence(prev => [...prev, landmarkData]);

    // Canvas에 그리기
    if (canvasRef.current && videoRef.current) {
      const canvasCtx = canvasRef.current.getContext('2d');
      if (canvasCtx) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        canvasCtx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

        // 랜드마크 그리기
        drawLandmarks(canvasCtx, results);

        canvasCtx.restore();
      }
    }
  };

  const drawLandmarks = (ctx: CanvasRenderingContext2D, results: any) => {
    const drawConnectors = (landmarks: any[], connections: number[][], color: string) => {
      if (!landmarks) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      for (const [start, end] of connections) {
        if (landmarks[start] && landmarks[end]) {
          ctx.beginPath();
          ctx.moveTo(landmarks[start].x * ctx.canvas.width, landmarks[start].y * ctx.canvas.height);
          ctx.lineTo(landmarks[end].x * ctx.canvas.width, landmarks[end].y * ctx.canvas.height);
          ctx.stroke();
        }
      }
    };

    const drawPoints = (landmarks: any[], color: string, radius: number = 3) => {
      if (!landmarks) return;
      ctx.fillStyle = color;
      for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * ctx.canvas.width, landmark.y * ctx.canvas.height, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
    };

    // 손 연결선 정의
    const HAND_CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17]
    ];

    // 포즈 주요 연결선
    const POSE_CONNECTIONS = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24], [23, 25], [24, 26],
      [25, 27], [26, 28]
    ];

    // 왼손 그리기
    if (results.leftHandLandmarks) {
      drawConnectors(results.leftHandLandmarks, HAND_CONNECTIONS, '#00FFFF');
      drawPoints(results.leftHandLandmarks, '#0088FF');
    }

    // 오른손 그리기
    if (results.rightHandLandmarks) {
      drawConnectors(results.rightHandLandmarks, HAND_CONNECTIONS, '#FFFF00');
      drawPoints(results.rightHandLandmarks, '#FF8800');
    }

    // 포즈 그리기
    if (results.poseLandmarks) {
      drawConnectors(results.poseLandmarks, POSE_CONNECTIONS, '#00FF00');
      drawPoints(results.poseLandmarks.slice(11, 29), '#00AA00', 4);
    }
  };

  const processVideo = async () => {
    if (!videoRef.current || !holisticRef.current) {
      onError('비디오 또는 MediaPipe 초기화 실패');
      return;
    }

    setIsProcessing(true);
    setRecordedSequence([]);
    recordedSequenceRef.current = []; // ref도 초기화

    const video = videoRef.current;
    const duration = video.duration;
    const fps = 10; // 초당 10프레임 처리
    const interval = 1 / fps;

    let currentTime = 0;

    const processFrame = async () => {
      if (currentTime >= duration) {
        setIsProcessing(false);
        console.log(`✅ 비디오 처리 완료: 총 ${recordedSequenceRef.current.length}개 프레임 추출`);
        onLandmarksExtracted(recordedSequenceRef.current); // ref 사용
        onComplete();
        return;
      }

      video.currentTime = currentTime;

      await new Promise<void>((resolve) => {
        video.onseeked = async () => {
          if (canvasRef.current) {
            await holisticRef.current.send({ image: video });
          }
          resolve();
        };
      });

      currentTime += interval;
      const progress = (currentTime / duration) * 100;
      onProgress(progress);

      // 다음 프레임 처리
      requestAnimationFrame(processFrame);
    };

    processFrame();
  };

  useEffect(() => {
    if (recordedSequence.length > 0) {
      onLandmarksExtracted(recordedSequence);
    }
  }, [recordedSequence]);

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-auto"
          controls
          style={{ display: isProcessing ? 'none' : 'block' }}
        />
        <canvas
          ref={canvasRef}
          className="w-full h-auto"
          style={{ display: isProcessing ? 'block' : 'none' }}
        />
      </div>

      {videoFile && !isProcessing && (
        <button
          onClick={processVideo}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold"
        >
          비디오 처리 시작
        </button>
      )}
    </div>
  );
}
