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

  const userPrompt = `다음 수화 단어들을 자연스러운 한국어 문장으로 변환해주세요. 단어 순서는 수화 문법 순서이므로 자연스러운 한국어로 재배치하고 조사를 추가해야 합니다.

수화 단어: "${words.join(' ')}"

규칙:
1. 한국어 문법에 맞게 단어 순서를 재배치하세요.
2. 적절한 조사(은/는, 이/가, 을/를 등)를 추가하세요.
3. 문맥에 맞는 동사/형용사 어미(-습니다, -어요 등)를 사용하세요.
4. 문장 끝에 마침표를 찍어주세요.
5. 다른 설명 없이 변환된 문장만 간결하게 출력하세요.`;

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
      const result = response.choices[0].message.content?.trim() ?? '';
      return result || words.join(' ');
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
