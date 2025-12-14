import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Hand, CheckCircle2, AlertCircle, Circle, StopCircle, Video, Camera, Upload } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import WebcamCapture from "@/components/sign-language/WebcamCapture";
import VideoProcessor from "@/components/sign-language/VideoProcessor";
import type { SignLanguage } from '@/lib/supabaseClient';

interface LearningModeProps {
  signs: SignLanguage[];
}

export default function LearningMode({ signs }: LearningModeProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSequence, setRecordedSequence] = useState([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentLandmarks, setCurrentLandmarks] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [inputMode, setInputMode] = useState<'camera' | 'video'>('camera');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const recordingTimerRef = useRef(null);
  const startTimeRef = useRef(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data: Omit<SignLanguage, 'id' | 'created_at' | 'updated_at'>) => base44.entities.SignLanguage.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['signs'] });
      setStatus({ type: 'success', message: '수화가 성공적으로 저장되었습니다!' });
      setName('');
      setRecordedSequence([]);
      setRecordingTime(0);
      setTimeout(() => setStatus(null), 3000);
    },
    onError: (error) => {
      setStatus({ type: 'error', message: '저장 중 오류가 발생했습니다.' });
      setTimeout(() => setStatus(null), 3000);
    }
  });

  useEffect(() => {
    if (isRecording && currentLandmarks) {
      const timestamp = Date.now() - startTimeRef.current;

      // 특징 추출 시 이미 위치/크기/회전 불변 정규화됨
      setRecordedSequence(prev => [...prev, {
        timestamp,
        pose: currentLandmarks.pose || null,
        left_hand: currentLandmarks.leftHand || null,
        right_hand: currentLandmarks.rightHand || null,
        face: currentLandmarks.face || null,
        left_hand_features: currentLandmarks.leftHandFeatures || null,
        right_hand_features: currentLandmarks.rightHandFeatures || null,
        pose_features: currentLandmarks.poseFeatures || null
      }]);
    }
  }, [currentLandmarks, isRecording]);

  const startRecording = () => {
    if (!currentLandmarks || (!currentLandmarks.pose && !currentLandmarks.leftHand && !currentLandmarks.rightHand)) {
      setStatus({ type: 'error', message: '신체가 감지되지 않았습니다. 카메라 앞에 서주세요.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    setRecordedSequence([]);
    setRecordingTime(0);
    startTimeRef.current = Date.now();
    setIsRecording(true);

    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 0.1);
    }, 100);
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
  };

  const captureThumbnail = () => {
    // 카메라 모드에서는 썸네일을 캡처할 수 없으므로 null 반환
    // TODO: WebcamCapture 컴포넌트에서 직접 썸네일을 얻는 방법 구현 필요
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setRecordedSequence([]);
      setVideoProgress(0);
    } else {
      setStatus({ type: 'error', message: '비디오 파일만 업로드 가능합니다.' });
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleVideoLandmarksExtracted = (sequence: any[]) => {
    setRecordedSequence(sequence);
  };

  const handleVideoProcessComplete = () => {
    setStatus({ type: 'success', message: '비디오 처리가 완료되었습니다!' });
    setTimeout(() => setStatus(null), 3000);
  };

  const handleVideoProcessError = (error: string) => {
    setStatus({ type: 'error', message: error });
    setTimeout(() => setStatus(null), 3000);
  };

  const resetVideoUpload = () => {
    setVideoFile(null);
    setRecordedSequence([]);
    setVideoProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      setStatus({ type: 'error', message: '수화 이름을 입력해주세요.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    const duplicate = signs.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setStatus({ type: 'error', message: '같은 이름의 수화가 이미 존재합니다.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    if (!recordedSequence || recordedSequence.length < 5) {
      setStatus({ type: 'error', message: '수화 동작을 먼저 녹화해주세요. (최소 0.5초 이상)' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    const duration = recordedSequence[recordedSequence.length - 1].timestamp / 1000;
    const thumbnailData = inputMode === 'camera' ? captureThumbnail() : null;

    saveMutation.mutate({
      name: name.trim(),
      landmarks_sequence: recordedSequence,
      duration: duration,
      thumbnail: thumbnailData
    });

    // 비디오 모드인 경우 업로드 리셋
    if (inputMode === 'video') {
      resetVideoUpload();
    }
  };

  const hasDetection = currentLandmarks && (currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand);

  return (
    <div className="space-y-6">
      {/* 입력 모드 선택 */}
      <div className="flex gap-4 justify-center">
        <Button
          onClick={() => {
            setInputMode('camera');
            resetVideoUpload();
          }}
          variant={inputMode === 'camera' ? 'default' : 'outline'}
          className={inputMode === 'camera' ? 'bg-blue-500 hover:bg-blue-600' : ''}
        >
          <Camera className="w-4 h-4 mr-2" />
          실시간 카메라
        </Button>
        <Button
          onClick={() => setInputMode('video')}
          variant={inputMode === 'video' ? 'default' : 'outline'}
          className={inputMode === 'video' ? 'bg-blue-500 hover:bg-blue-600' : ''}
        >
          <Video className="w-4 h-4 mr-2" />
          영상 업로드
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          {inputMode === 'camera' ? (
            <WebcamCapture
              onLandmarksDetected={setCurrentLandmarks}
              showLandmarks={true}
            />
          ) : (
            <Card className="shadow-xl">
              <CardHeader className="bg-gradient-to-r from-purple-500 to-pink-600 text-white">
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  영상 파일 업로드
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="video-upload"
                  />
                  <Label
                    htmlFor="video-upload"
                    className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <Upload className="w-12 h-12 text-gray-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">
                      클릭하여 비디오 파일 선택
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                      MP4, MOV, AVI 등
                    </span>
                  </Label>

                  {videoFile && (
                    <>
                      <Alert className="bg-blue-50 border-blue-200">
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-800">
                          파일: {videoFile.name}
                        </AlertDescription>
                      </Alert>

                      <VideoProcessor
                        videoFile={videoFile}
                        onLandmarksExtracted={handleVideoLandmarksExtracted}
                        onProgress={setVideoProgress}
                        onComplete={handleVideoProcessComplete}
                        onError={handleVideoProcessError}
                      />

                      {videoProgress > 0 && videoProgress < 100 && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>처리 진행률</span>
                            <span className="font-mono font-bold">{videoProgress.toFixed(0)}%</span>
                          </div>
                          <Progress value={videoProgress} className="h-2" />
                        </div>
                      )}

                      <Button
                        onClick={resetVideoUpload}
                        variant="outline"
                        className="w-full"
                      >
                        다른 파일 선택
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5" />
              수화 {inputMode === 'camera' ? '녹화' : '저장'}하기
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sign-name">수화 이름</Label>
              <Input
                id="sign-name"
                placeholder="예: 안녕하세요, 감사합니다, ㄱ, ㄴ 등"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg"
              />
            </div>

            {inputMode === 'camera' && (
              <>
                <div className="space-y-3 p-4 bg-purple-50 rounded-lg border-2 border-purple-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-900">동작 녹화</span>
                    {isRecording && (
                      <Badge className="bg-red-500 text-white animate-pulse">
                        녹화 중
                      </Badge>
                    )}
                  </div>

                  {isRecording && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-purple-700">
                        <span>녹화 시간</span>
                        <span className="font-mono font-bold">{recordingTime.toFixed(1)}초</span>
                      </div>
                      <Progress value={(recordingTime / 5) * 100} className="h-2" />
                    </div>
                  )}

                  {recordedSequence.length > 0 && !isRecording && (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        동작 녹화 완료! {recordedSequence.length}개 프레임, {(recordedSequence[recordedSequence.length - 1].timestamp / 1000).toFixed(1)}초
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    {!isRecording ? (
                      <Button
                        onClick={startRecording}
                        disabled={!hasDetection}
                        className="flex-1 bg-red-500 hover:bg-red-600"
                      >
                        <Circle className="w-4 h-4 mr-2 fill-current" />
                        녹화 시작
                      </Button>
                    ) : (
                      <Button
                        onClick={stopRecording}
                        className="flex-1 bg-gray-800 hover:bg-gray-900"
                      >
                        <StopCircle className="w-4 h-4 mr-2" />
                        녹화 중지
                      </Button>
                    )}
                  </div>
                </div>

                {hasDetection ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      <div className="space-y-1">
                        <p className="font-semibold">감지된 랜드마크:</p>
                        {currentLandmarks.pose && <p>✓ 전신 포즈 ({currentLandmarks.pose.length}개)</p>}
                        {currentLandmarks.leftHand && <p>✓ 왼손 ({currentLandmarks.leftHand.length}개)</p>}
                        {currentLandmarks.rightHand && <p>✓ 오른손 ({currentLandmarks.rightHand.length}개)</p>}
                        {currentLandmarks.face && <p>✓ 얼굴 ({currentLandmarks.face.length}개)</p>}
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      카메라 앞에 서주세요
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}

            {inputMode === 'video' && recordedSequence.length > 0 && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  비디오 처리 완료! {recordedSequence.length}개 프레임, {(recordedSequence[recordedSequence.length - 1].timestamp / 1000).toFixed(1)}초
                </AlertDescription>
              </Alert>
            )}

            {status && (
              <Alert className={status.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
                {status.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={status.type === 'success' ? 'text-green-800' : 'text-red-800'}>
                  {status.message}
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || (inputMode === 'camera' && isRecording) || recordedSequence.length < 5}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {saveMutation.isPending ? '저장 중...' : '수화 저장하기'}
            </Button>

            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-2 text-sm text-gray-600">사용 방법</h4>
              {inputMode === 'camera' ? (
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>카메라 앞에 서주세요</li>
                  <li>'녹화 시작'을 눌러 수화 동작을 녹화하세요</li>
                  <li>동작을 수행한 후 '녹화 중지'를 누르세요</li>
                  <li>이름을 입력하고 저장하세요</li>
                </ol>
              ) : (
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>수화 동작이 포함된 비디오 파일을 선택하세요</li>
                  <li>'비디오 처리 시작' 버튼을 클릭하세요</li>
                  <li>처리가 완료될 때까지 기다리세요</li>
                  <li>수화 이름을 입력하고 저장하세요</li>
                </ol>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}