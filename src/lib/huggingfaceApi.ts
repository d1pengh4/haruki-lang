import { HfInference } from '@huggingface/inference';

export async function convertToNaturalSentence(words: string[]): Promise<string> {
  console.log('🔄 Hugging Face 문장 변환 시작:', words);

  if (words.length === 0) {
    console.log('⚠️ 단어가 없음');
    return '';
  }

  if (words.length === 1) {
    console.log('⚠️ 단어가 1개뿐, 변환 생략');
    return words[0];
  }

  const apiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
  console.log('🔑 Hugging Face API 키 확인:', apiKey ? `있음 (${apiKey.substring(0, 4)}...)` : '없음');

  if (!apiKey) {
    const errorMsg = 'Hugging Face API 키가 설정되지 않았습니다.';
    console.error(`❌ ${errorMsg}`);
    return `[AI 설정 오류: ${errorMsg}]`;
  }

  try {
    const hf = new HfInference(apiKey);
    const model = 'Qwen/Qwen2.5-7B-Instruct';
    console.log(`📡 Hugging Face API 호출 중... (모델: ${model})`);

    const userPrompt = `다음 수화 단어들을 자연스러운 한국어 문장으로 변환해주세요. 단어 순서는 수화 문법 순서이므로 자연스러운 한국어로 재배치하고 조사를 추가해야 합니다.

수화 단어: "${words.join(' ')}"

규칙:
1. 한국어 문법에 맞게 단어 순서를 재배치하세요.
2. 적절한 조사(은/는, 이/가, 을/를 등)를 추가하세요.
3. 문맥에 맞는 동사/형용사 어미(-습니다, -어요 등)를 사용하세요.
4. 문장 끝에 마침표를 찍어주세요.
5. 다른 설명 없이 변환된 문장만 간결하게 출력하세요.`;

    const response = await hf.chatCompletion({
      model: model,
      messages: [
        { role: "system", content: "You are a helpful assistant that converts a sequence of Korean Sign Language words into a single, natural Korean sentence." },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 250,
      temperature: 0.5,
      seed: 0,
    });

    console.log('✅ Hugging Face API 응답 받음:', response);
    
    const result = response.choices[0].message.content?.trim() || "";
    console.log('✨ 변환 완료:', result);
    
    if (!result) {
      console.log('⚠️ AI 모델이 빈 응답을 반환했습니다.');
      return `[AI 응답 없음]`;
    }
    
    return result;

  } catch (error) {
    console.error('❌ Hugging Face API 오류:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    // UI에 표시될 에러 메시지
    return `[AI 모델 오류: ${errorMessage}]`;
  }
}
