import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Trash2 } from 'lucide-react';

// 브라우저 SpeechRecognition (Chrome / Edge 지원)
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

interface Line {
  id: number;
  text: string;
}

/**
 * 음성 → 텍스트 모드.
 * 브라우저 내장 Web Speech API로 한국어 음성을 실시간 텍스트로 변환한다.
 * Chrome / Edge 에서 동작하며 외부 API 없이 완전 무료로 작동한다.
 */
export default function VoiceMode() {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const activeRef = useRef(false); // 클로저 안에서 최신 상태 참조용
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 텍스트마다 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, interim]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      activeRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    setIsListening(false);
    setInterim('');
    recRef.current?.stop();
    recRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge를 사용해주세요.');
      return;
    }
    setError(null);

    const rec = new SpeechRecognitionAPI();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (e: any) => {
      let interimBuf = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript: string = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          const text = transcript.trim();
          if (text) {
            setLines(prev => [...prev, { id: ++idRef.current, text }]);
          }
        } else {
          interimBuf += transcript;
        }
      }
      setInterim(interimBuf);
    };

    rec.onerror = (e: any) => {
      // 'aborted'는 수동 중지 시 발생 — 무시
      if (e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('마이크 권한이 필요합니다. 브라우저에서 마이크 접근을 허용해주세요.');
        activeRef.current = false;
        setIsListening(false);
      }
      // no-speech, network 등 일시적 오류는 onend 자동 재시작으로 처리
    };

    rec.onend = () => {
      setInterim('');
      // 사용자가 중지하지 않은 경우 자동 재시작 (Chrome은 침묵 후 자동 종료)
      if (activeRef.current) {
        try {
          rec.start();
        } catch {
          // 이미 시작 중이면 무시
        }
      } else {
        setIsListening(false);
      }
    };

    recRef.current = rec;
    activeRef.current = true;

    try {
      rec.start();
    } catch {
      setError('음성 인식을 시작할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      activeRef.current = false;
    }
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setInterim('');
  }, []);

  const hasContent = lines.length > 0 || interim.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* 상태 바 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          {isListening ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm text-white/50">듣는 중...</span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              <span className="text-sm text-white/30">대기 중</span>
            </>
          )}
        </div>

        {hasContent && (
          <button
            onClick={clear}
            className="flex items-center gap-1.5 text-xs text-white/25 hover:text-white/50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            지우기
          </button>
        )}
      </div>

      {/* 텍스트 출력 영역 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-8 min-h-0">
        {!hasContent ? (
          <div className="h-full flex flex-col items-center justify-center gap-5 select-none">
            <div className="w-20 h-20 rounded-full bg-white/4 flex items-center justify-center">
              <Mic className="w-8 h-8 text-white/15" />
            </div>
            <p className="text-white/25 text-sm text-center leading-relaxed">
              아래 마이크 버튼을 눌러<br />말하기를 시작하세요
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lines.map(line => (
              <p key={line.id} className="text-3xl font-medium text-white leading-snug tracking-tight">
                {line.text}
              </p>
            ))}
            {interim && (
              <p className="text-3xl font-medium text-white/35 leading-snug tracking-tight">
                {interim}
              </p>
            )}
          </div>
        )}
      </div>

      {/* 오류 메시지 */}
      {error && (
        <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* 마이크 버튼 */}
      <div className="shrink-0 flex flex-col items-center gap-3 py-8 border-t border-white/5">
        <button
          onClick={isListening ? stop : start}
          className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isListening
              ? 'bg-red-500 hover:bg-red-400 shadow-red-500/30'
              : 'bg-violet-600 hover:bg-violet-500 shadow-violet-500/30'
          }`}
        >
          {isListening
            ? <MicOff className="w-7 h-7 text-white" />
            : <Mic className="w-7 h-7 text-white" />
          }
        </button>
        <span className="text-xs text-white/25">
          {isListening ? '탭하여 중지' : '탭하여 시작'}
        </span>
      </div>
    </div>
  );
}
