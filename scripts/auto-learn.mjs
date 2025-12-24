#!/usr/bin/env node

/**
 * 자동 수화 학습 스크립트
 * 02 폴더의 영상 파일과 17 폴더의 JSON 파일을 매칭하여 자동으로 학습시킵니다.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Holistic from '@mediapipe/holistic';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Supabase 설정
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.');
  console.error('VITE_SUPABASE_URL:', supabaseUrl);
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseKey ? '설정됨' : '없음');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 학습할 파일 ID 목록
const fileIds = ['1501', '1502', '1503'];

console.log('🚀 자동 수화 학습 시작...\n');

for (const fileId of fileIds) {
  const videoPath = join(rootDir, '02', `${fileId}.mp4`);
  const jsonPath = join(rootDir, '17', `${fileId}.json`);

  console.log(`\n📁 처리 중: ${fileId}`);
  console.log(`   영상: ${videoPath}`);
  console.log(`   JSON: ${jsonPath}`);

  try {
    // JSON 파일 읽기
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const signName = jsonData.data[0]?.attributes[0]?.name;

    if (!signName) {
      console.error(`   ❌ JSON 파일에서 수화 이름을 찾을 수 없습니다.`);
      continue;
    }

    console.log(`   ✅ 수화 이름: ${signName}`);

    // 이미 존재하는지 확인
    const { data: existing } = await supabase
      .from('sign_languages')
      .select('id, name')
      .eq('name', signName)
      .single();

    if (existing) {
      console.log(`   ⚠️  이미 존재하는 수화입니다. 건너뜁니다.`);
      continue;
    }

    // 여기서는 실제 비디오 처리를 브라우저에서 해야 하므로
    // 웹 인터페이스를 통해 업로드하도록 안내
    console.log(`   ℹ️  브라우저에서 수동으로 업로드해야 합니다.`);
    console.log(`      - 파일: ${videoPath}`);
    console.log(`      - 이름: ${signName}`);

  } catch (error) {
    console.error(`   ❌ 오류 발생:`, error.message);
  }
}

console.log('\n\n✨ 처리 완료!');
console.log('\n📝 다음 단계:');
console.log('1. http://localhost:5175 접속');
console.log('2. "수화 학습하기" 버튼 클릭');
console.log('3. "영상 업로드" 탭 선택');
console.log('4. 위에 표시된 영상 파일들을 순서대로 업로드');
