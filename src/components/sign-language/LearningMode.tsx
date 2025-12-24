import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Hand, CheckCircle2, AlertCircle, Circle, StopCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import WebcamCapture from "@/components/sign-language/WebcamCapture";
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

  const recordingTimerRef = useRef(null);
  const startTimeRef = useRef(null);
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
    return null;
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
    const thumbnailData = captureThumbnail();

    saveMutation.mutate({
      name: name.trim(),
      landmarks_sequence: recordedSequence,
      duration: duration,
      thumbnail: thumbnailData
    });
  };

  const hasDetection = currentLandmarks && (currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <WebcamCapture
            onLandmarksDetected={setCurrentLandmarks}
            showLandmarks={true}
          />
        </div>

        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <Hand className="w-5 h-5" />
              수화 녹화하기
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
              disabled={saveMutation.isPending || isRecording || recordedSequence.length < 5}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
              size="lg"
            >
              <Save className="w-5 h-5 mr-2" />
              {saveMutation.isPending ? '저장 중...' : '수화 저장하기'}
            </Button>

            <div className="pt-4 border-t">
              <h4 className="font-semibold mb-2 text-sm text-gray-600">사용 방법</h4>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>카메라 앞에 서주세요</li>
                <li>'녹화 시작'을 눌러 수화 동작을 녹화하세요</li>
                <li>동작을 수행한 후 '녹화 중지'를 누르세요</li>
                <li>이름을 입력하고 저장하세요</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}