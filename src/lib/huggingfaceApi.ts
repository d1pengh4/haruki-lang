const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

// P3-12: 싱글톤 — 매 호출마다 new HfInference() 생성 방지
let _hfClient: unknown = null;
let _hfApiKey: string | null = null;

async function getHfClient(apiKey: string): Promise<any> {
  if (_hfClient && _hfApiKey === apiKey) return _hfClient;
  const { HfInference } = await import('@huggingface/inference');
  _hfClient = new HfInference(apiKey);
  _hfApiKey = apiKey;
  return _hfClient;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function convertToNaturalSentence(words: string[]): Promise<string> {
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];

  const apiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
  if (!apiKey) return words.join(' ');

  const userPrompt = `수화 단어 목록: ${words.join(', ')}

위 단어들을 자연스러운 한국어 문장 하나로 만들어주세요.
- 조사와 어미를 추가하세요.
- 반드시 한국어 문장 하나만 출력하세요. 설명, 번호, 따옴표 없이.`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const hf = await getHfClient(apiKey);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let response;
      try {
        response = await hf.chatCompletion({
          model: 'Qwen/Qwen2.5-7B-Instruct',
          messages: [
            { role: 'system', content: 'You are a helpful assistant that converts a sequence of Korean Sign Language words into a single, natural Korean sentence.' },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 250,
          temperature: 0.5,
          seed: 0,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      const raw = response.choices[0].message.content?.trim() ?? '';
      // 첫 줄만 취하고 따옴표·마크다운 기호 제거
      const result = raw
        .split('\n').find(l => l.trim().length > 0) ?? ''
      const cleaned = result
        .replace(/^[\s"'`「」『』【】\-\*\d\.]+/, '')
        .replace(/[\s"'`」』】]+$/, '')
        .trim();
      return cleaned || words.join(' ');
    } catch (error) {
      // API 오류 시 클라이언트 초기화 (다음 시도에서 재생성)
      _hfClient = null;
      _hfApiKey = null;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      console.warn('HuggingFace API unavailable, using raw words:', error);
      return words.join(' ');
    }
  }
  return words.join(' ');
}
