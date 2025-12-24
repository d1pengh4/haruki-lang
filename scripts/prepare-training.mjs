#!/usr/bin/env node

/**
 * 수화 학습 준비 스크립트
 * 02 폴더의 영상 파일과 17 폴더의 JSON 파일을 매칭하여 학습 정보를 출력합니다.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 학습할 파일 ID 목록
const fileIds = process.argv.slice(2);

if (fileIds.length === 0) {
  console.log('사용법: node scripts/prepare-training.mjs [파일ID...]');
  console.log('예시: node scripts/prepare-training.mjs 1501 1502 1503');
  process.exit(1);
}

console.log('📚 수화 학습 준비\n');
console.log('='.repeat(60));

const trainingData = [];

for (const fileId of fileIds) {
  const videoPath = join(rootDir, '02', `${fileId}.mp4`);
  const jsonPath = join(rootDir, '17', `${fileId}.json`);

  console.log(`\n파일 ID: ${fileId}`);

  // 파일 존재 확인
  if (!existsSync(videoPath)) {
    console.log(`  ❌ 영상 파일 없음: ${videoPath}`);
    continue;
  }

  if (!existsSync(jsonPath)) {
    console.log(`  ❌ JSON 파일 없음: ${jsonPath}`);
    continue;
  }

  try {
    // JSON 파일 읽기
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const signName = jsonData.data[0]?.attributes[0]?.name;
    const duration = jsonData.metaData?.duration;
    const start = jsonData.data[0]?.start;
    const end = jsonData.data[0]?.end;

    if (!signName) {
      console.log(`  ❌ 수화 이름을 찾을 수 없습니다.`);
      continue;
    }

    console.log(`  ✅ 수화 이름: ${signName}`);
    console.log(`  📹 영상 파일: ${videoPath}`);
    console.log(`  ⏱️  전체 길이: ${duration}초`);
    console.log(`  📍 수화 구간: ${start}초 ~ ${end}초 (${(end - start).toFixed(2)}초)`);

    trainingData.push({
      fileId,
      signName,
      videoPath,
      duration,
      start,
      end
    });

  } catch (error) {
    console.log(`  ❌ 오류: ${error.message}`);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`\n📊 총 ${trainingData.length}개 파일 준비 완료\n`);

if (trainingData.length > 0) {
  console.log('📝 학습 방법:\n');
  console.log('1. 개발 서버 시작:');
  console.log('   npm run dev\n');
  console.log('2. 브라우저에서 http://localhost:5175 접속\n');
  console.log('3. "수화 학습하기" 버튼 클릭\n');
  console.log('4. "영상 업로드" 탭 선택\n');
  console.log('5. 다음 파일들을 순서대로 업로드:\n');

  trainingData.forEach((data, index) => {
    console.log(`   ${index + 1}. 파일: ${data.videoPath}`);
    console.log(`      이름: ${data.signName}`);
    console.log(`      (${data.fileId}.mp4)\n`);
  });

  console.log('💡 Tip: 각 영상을 업로드하면 자동으로 랜드마크가 추출됩니다.');
  console.log('        처리가 완료되면 위의 "이름"을 입력하고 저장하세요.\n');
}

// JSON 파일로 저장
import { writeFileSync } from 'fs';
const outputPath = join(rootDir, 'training-list.json');
writeFileSync(outputPath, JSON.stringify(trainingData, null, 2));
console.log(`✅ 학습 목록이 저장되었습니다: ${outputPath}\n`);
