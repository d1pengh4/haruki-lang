import { useRef, useEffect, useState } from 'react';
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
  const landmarkSequenceRef = useRef<any[]>([]);

  // 비디오 파일 로드
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

  // MediaPipe Holistic 초기화 (WebcamCapture와 완전히 동일한 설정)
  useEffect(() => {
    if (window.Holistic) {
      holisticRef.current = new window.Holistic({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      // WebcamCapture와 동일한 옵션
      holisticRef.current.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    }

    return () => {
      if (holisticRef.current) {
        holisticRef.current.close();
      }
    };
  }, []);

  // 프레임 처리 - WebcamCapture의 onResults와 완전히 동일
  const processFrame = async (video: HTMLVideoElement): Promise<any> => {
    return new Promise((resolve) => {
      if (!holisticRef.current || !video) {
        resolve(null);
        return;
      }

      // 일회성 결과 핸들러
      const handleResults = (results: any) => {
        // WebcamCapture와 동일: 신체 크기 기준값 계산 (어깨 너비)
        let bodyScale = null;
        if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
          const leftShoulder = results.poseLandmarks[11];
          const rightShoulder = results.poseLandmarks[12];
          const dx = leftShoulder.x - rightShoulder.x;
          const dy = leftShoulder.y - rightShoulder.y;
          const dz = leftShoulder.z - rightShoulder.z;
          bodyScale = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        // WebcamCapture와 동일: bodyScale을 전달하여 특징 추출
        const leftHandFeatureObj = results.leftHandLandmarks
          ? extractHandFeatures(results.leftHandLandmarks, bodyScale)
          : null;
        const rightHandFeatureObj = results.rightHandLandmarks
          ? extractHandFeatures(results.rightHandLandmarks, bodyScale)
          : null;
        const poseFeatures = results.poseLandmarks
          ? extractPoseFeatures(results.poseLandmarks)
          : null;

        // WebcamCapture와 동일: 특징을 배열로 변환
        const leftHandFeatures = leftHandFeatureObj ? flattenHandFeatures(leftHandFeatureObj) : null;
        const rightHandFeatures = rightHandFeatureObj ? flattenHandFeatures(rightHandFeatureObj) : null;

        // WebcamCapture와 동일한 데이터 구조 (단, face는 주요 포인트만)
        const landmarkData = {
          timestamp: video.currentTime * 1000, // 밀리초
          pose: results.poseLandmarks || null,
          left_hand: results.leftHandLandmarks || null,
          right_hand: results.rightHandLandmarks || null,
          face: results.faceLandmarks || null,
          left_hand_features: leftHandFeatures,
          right_hand_features: rightHandFeatures,
          pose_features: poseFeatures
        };

        resolve(landmarkData);
      };

      holisticRef.current.onResults = handleResults;
      holisticRef.current.send({ image: video });
    });
  };

  // 비디오 전체 처리
  const processVideo = async () => {
    console.log('🎬 processVideo 시작');

    if (!videoRef.current) {
      console.error('❌ videoRef.current가 없음');
      onError('비디오 로드 실패');
      return;
    }

    const video = videoRef.current;
    console.log('📹 비디오 엘리먼트 확인:', video);

    // 비디오 메타데이터 로드 대기
    if (!video.duration || isNaN(video.duration)) {
      console.log('⏳ 비디오 메타데이터 로드 대기 중...');
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('메타데이터 로드 타임아웃')), 5000);
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            console.log('✅ 메타데이터 로드 완료');
            resolve();
          };
          video.load();
        });
      } catch (err) {
        console.error('❌ 메타데이터 로드 실패:', err);
        onError('비디오 로드 실패. 다른 파일을 시도해주세요.');
        return;
      }
    }

    // MediaPipe 초기화 대기
    if (!holisticRef.current) {
      console.error('❌ holisticRef.current가 없음');
      onError('MediaPipe 초기화 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    console.log('✅ MediaPipe 준비 완료');
    setIsProcessing(true);
    landmarkSequenceRef.current = [];

    const duration = video.duration;
    console.log('⏱️ 비디오 길이:', duration);

    if (!duration || isNaN(duration) || duration === 0) {
      setIsProcessing(false);
      onError('비디오 길이를 읽을 수 없습니다. 다른 파일을 시도해주세요.');
      return;
    }

    const fps = 10;
    const interval = 1 / fps;
    const totalFrames = Math.floor(duration * fps);

    let currentTime = 0;
    const sequence: any[] = [];

    console.log(`📹 비디오 처리 시작: ${duration.toFixed(2)}초, ${totalFrames}개 예상 프레임`);

    try {
      let frameCount = 0;
      while (currentTime < duration) {
        frameCount++;
        console.log(`🎞️ 프레임 ${frameCount}/${totalFrames} 처리 중... (${currentTime.toFixed(2)}s)`);

        // seeked 이벤트 대기 (타임아웃 추가) - 이벤트 핸들러를 먼저 설정
        const seekPromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            video.removeEventListener('seeked', onSeeked);
            reject(new Error('Seek 타임아웃'));
          }, 2000);

          const onSeeked = () => {
            clearTimeout(timeout);
            video.removeEventListener('seeked', onSeeked);
            resolve();
          };

          video.addEventListener('seeked', onSeeked);
        });

        // 비디오의 특정 시점으로 이동
        video.currentTime = currentTime;

        try {
          await seekPromise;
        } catch (err) {
          console.warn(`⚠️ Seek 실패 (${currentTime.toFixed(2)}s), 다음 프레임으로 이동`);
          currentTime += interval;
          continue;
        }

        // 프레임 처리
        try {
          const landmarkData = await Promise.race([
            processFrame(video),
            new Promise((_, reject) => setTimeout(() => reject(new Error('프레임 처리 타임아웃')), 5000))
          ]) as any;

          if (landmarkData) {
            sequence.push(landmarkData);

            // 손 감지 로깅
            const hasHands = landmarkData.left_hand_features || landmarkData.right_hand_features;
            if (hasHands) {
              console.log(`✓ 프레임 ${currentTime.toFixed(2)}s: 왼손=${landmarkData.left_hand_features ? '✓' : '✗'}, 오른손=${landmarkData.right_hand_features ? '✓' : '✗'}`);
            }
          }
        } catch (err) {
          console.warn(`⚠️ 프레임 처리 실패 (${currentTime.toFixed(2)}s):`, err);
        }

        // 진행률 업데이트
        currentTime += interval;
        const progress = (currentTime / duration) * 100;
        onProgress(Math.min(progress, 100));
      }

      // 처리 완료
      const framesWithHands = sequence.filter(f => f.left_hand_features || f.right_hand_features).length;
      const detectionRate = sequence.length > 0 ? (framesWithHands / sequence.length * 100) : 0;

      console.log(`✅ 비디오 처리 완료!`);
      console.log(`   총 프레임: ${sequence.length}개`);
      console.log(`   손 감지: ${framesWithHands}개 (${detectionRate.toFixed(1)}%)`);

      if (detectionRate < 30) {
        console.warn(`⚠️  경고: 손 감지율이 낮습니다 (${detectionRate.toFixed(1)}%). 인식 정확도가 떨어질 수 있습니다.`);
      }

      if (sequence.length === 0) {
        setIsProcessing(false);
        onError('프레임을 처리할 수 없었습니다. 다른 비디오 파일을 시도해주세요.');
        return;
      }

      landmarkSequenceRef.current = sequence;
      onLandmarksExtracted(sequence);
      setIsProcessing(false);
      onComplete();
    } catch (err) {
      console.error('❌ 비디오 처리 중 오류:', err);
      setIsProcessing(false);
      onError('비디오 처리 중 오류가 발생했습니다.');
    }
  };

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

      {isProcessing && (
        <div className="text-center text-sm text-gray-600">
          <p>비디오 처리 중... MediaPipe로 프레임별 특징 추출 중입니다.</p>
        </div>
      )}
    </div>
  );
}
