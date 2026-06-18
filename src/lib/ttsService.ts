/**
 * Web Speech API 기반 TTS 서비스
 * 외부 API 불필요 – 브라우저 내장 음성 합성 사용
 */

// 문장 전체 읽기 (이전 발화 취소 후 시작)
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// 단어 한 개 읽기 — 문장 읽기 중이면 방해하지 않음
export function speakWord(text: string): void {
  if (!('speechSynthesis' in window)) return;
  if (window.speechSynthesis.speaking) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isTTSSupported(): boolean {
  return 'speechSynthesis' in window;
}
