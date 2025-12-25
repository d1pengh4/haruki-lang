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
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSequence, setRecordedSequence] = useState<any[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentLandmarks, setCurrentLandmarks] = useState<any | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
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
    if (isRecording && currentLandmarks && startTimeRef.current) {
      const timestamp = Date.now() - startTimeRef.current;
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

  const handleSave = () => {
    if (!name.trim()) {
      setStatus({ type: 'error', message: '수화 이름을 입력해주세요.' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }
    if (recordedSequence.length < 5) {
      setStatus({ type: 'error', message: '수화 동작을 먼저 녹화해주세요. (최소 0.5초 이상)' });
      setTimeout(() => setStatus(null), 3000);
      return;
    }

    const duration = recordedSequence[recordedSequence.length - 1].timestamp / 1000;
    saveMutation.mutate({
      name: name.trim(),
      landmarks_sequence: recordedSequence,
      duration: duration,
      thumbnail: null // Thumbnail capture not implemented
    });
  };

  const hasDetection = currentLandmarks && (currentLandmarks.pose || currentLandmarks.leftHand || currentLandmarks.rightHand);

  return (
    <div className="space-y-6 text-foreground">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <WebcamCapture
            onLandmarksDetected={setCurrentLandmarks}
            showLandmarks={true}
          />
        </div>

        <Card className="shadow-xl bg-card border-border">
          <CardHeader className="bg-gradient-to-r from-primary/50 to-primary/20 text-primary-foreground">
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
                className="text-lg bg-background/50"
              />
            </div>

            <div className="space-y-3 p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary-foreground/90">동작 녹화</span>
                {isRecording && <Badge variant="destructive" className="animate-pulse">녹화 중</Badge>}
              </div>

              {isRecording && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-primary/80">
                    <span>녹화 시간</span>
                    <span className="font-mono font-bold">{recordingTime.toFixed(1)}초</span>
                  </div>
                  <Progress value={(recordingTime / 5) * 100} className="h-2 bg-primary/20" />
                </div>
              )}

              {recordedSequence.length > 0 && !isRecording && (
                <Alert className="bg-green-900/30 text-green-300 border-green-700/50">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <AlertDescription>
                    동작 녹화 완료! {recordedSequence.length}개 프레임, {(recordedSequence[recordedSequence.length - 1].timestamp / 1000).toFixed(1)}초
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                {!isRecording ? (
                  <Button onClick={startRecording} disabled={!hasDetection} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    <Circle className="w-4 h-4 mr-2 fill-current" />
                    녹화 시작
                  </Button>
                ) : (
                  <Button onClick={stopRecording} className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/80">
                    <StopCircle className="w-4 h-4 mr-2" />
                    녹화 중지
                  </Button>
                )}
              </div>
            </div>

            {hasDetection ? (
              <Alert className="bg-green-900/30 text-green-300 border-green-700/50">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription>
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
              <Alert variant="destructive" className="bg-yellow-900/20 border-yellow-700/50 text-yellow-300">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription>카메라 앞에 서주세요</AlertDescription>
              </Alert>
            )}

            {status && (
              <Alert className={status.type === 'success' ? 'bg-green-900/30 text-green-300 border-green-700/50' : 'bg-red-900/30 text-red-300 border-red-700/50'}>
                {status.type === 'success' ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <AlertCircle className="h-4 w-4 text-red-400" />}
                <AlertDescription>{status.message}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleSave} disabled={saveMutation.isPending || isRecording || recordedSequence.length < 5} className="w-full bg-primary text-primary-foreground hover:bg-primary/90" size="lg">
              <Save className="w-5 h-5 mr-2" />
              {saveMutation.isPending ? '저장 중...' : '수화 저장하기'}
            </Button>

            <div className="pt-4 border-t border-border">
              <h4 className="font-semibold mb-2 text-sm text-muted-foreground">사용 방법</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
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