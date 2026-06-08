/**
 * Web Speech API 기반 TTS 서비스
 * 외부 API 불필요 – 브라우저 내장 음성 합성 사용
 */

export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.9;
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
