#!/usr/bin/env node

/**
 * 데이터 검증 스크립트
 * 02 폴더의 영상과 17 폴더의 JSON 메타데이터가 제대로 매칭되는지 확인
 * 
 * 사용법:
 *   npm run validate-data
 *   npm run validate-data -- --verbose  (상세 출력)
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 옵션 파싱
const verbose = process.argv.includes('--verbose');

const videoDir = join(rootDir, '02');
const metadataDir = join(rootDir, '17');

console.log('═══════════════════════════════════════════════════');
console.log('🔍 데이터 검증 시작');
console.log('═══════════════════════════════════════════════════\n');

// ===== 1. 영상 파일 검사 =====
console.log('📹 영상 파일 검사...');
let videoFiles = [];
try {
  const files = readdirSync(videoDir);
  videoFiles = files
    .filter(f => f.endsWith('.mp4'))
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  console.log(`✅ 발견된 영상: ${videoFiles.length}개`);
  
  if (verbose) {
    videoFiles.slice(0, 10).forEach(f => console.log(`   • ${f}`));
    if (videoFiles.length > 10) {
      console.log(`   ... 등 ${videoFiles.length - 10}개 더`);
    }
  }
} catch (err) {
  console.error(`❌ 영상 파일 읽기 실패: ${err.message}`);
  process.exit(1);
}

// ===== 2. 메타데이터 파일 검사 =====
console.log('\n📋 메타데이터 파일 검사...');
let jsonFiles = [];
try {
  const files = readdirSync(metadataDir);
  jsonFiles = files
    .filter(f => f.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  console.log(`✅ 발견된 JSON: ${jsonFiles.length}개`);
  
  if (verbose) {
    jsonFiles.slice(0, 10).forEach(f => console.log(`   • ${f}`));
    if (jsonFiles.length > 10) {
      console.log(`   ... 등 ${jsonFiles.length - 10}개 더`);
    }
  }
} catch (err) {
  console.error(`❌ 메타데이터 파일 읽기 실패: ${err.message}`);
  process.exit(1);
}

// ===== 3. 파일 크기 분석 =====
console.log('\n💾 파일 크기 분석...');
let totalVideoSize = 0;
let totalJsonSize = 0;

videoFiles.forEach(f => {
  const path = join(videoDir, f);
  const stats = statSync(path);
  totalVideoSize += stats.size;
});

jsonFiles.forEach(f => {
  const path = join(metadataDir, f);
  const stats = statSync(path);
  totalJsonSize += stats.size;
});

console.log(`📹 영상 전체 크기: ${(totalVideoSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`📋 JSON 전체 크기: ${(totalJsonSize / 1024 / 1024).toFixed(2)} MB`);

// ===== 4. 매칭 확인 =====
console.log('\n🔗 파일 매칭 확인...');
const videoIds = videoFiles.map(f => f.replace('.mp4', ''));
const jsonIds = jsonFiles.map(f => f.replace('.json', ''));

let matched = 0;
let noJsonCount = 0;
let invalidJsonCount = 0;
let noNameCount = 0;
const issues = [];

for (const id of videoIds) {
  if (!jsonIds.includes(id)) {
    noJsonCount++;
    issues.push(`[${id}] JSON 파일 없음`);
    if (verbose) {
      console.log(`⚠️  ${id}: JSON 파일 없음`);
    }
    continue;
  }

  const jsonPath = join(metadataDir, `${id}.json`);
  let signName = null;

  try {
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    signName = jsonData.data?.[0]?.attributes?.[0]?.name;
    
    if (signName) {
      matched++;
      if (verbose) {
        console.log(`✅ ${id}: "${signName}"`);
      }
    } else {
      noNameCount++;
      issues.push(`[${id}] name 필드 없음`);
      if (verbose) {
        console.log(`⚠️  ${id}: name 필드 없음`);
      }
    }
  } catch (err) {
    invalidJsonCount++;
    issues.push(`[${id}] JSON 파싱 오류: ${err.message}`);
    if (verbose) {
      console.log(`❌ ${id}: JSON 파싱 오류 - ${err.message}`);
    }
  }
}

// ===== 5. 역방향 확인 =====
console.log('\n🔄 JSON 파일의 매칭 확인...');
let orphanedJson = 0;
const orphanedIds = [];

for (const id of jsonIds) {
  if (!videoIds.includes(id)) {
    orphanedJson++;
    orphanedIds.push(id);
    issues.push(`[${id}] 영상 파일 없음 (고아 JSON)`);
  }
}

if (orphanedJson > 0) {
  console.log(`⚠️  고아 JSON 파일: ${orphanedJson}개 (영상 없음)`);
  if (verbose && orphanedIds.length <= 10) {
    orphanedIds.forEach(id => console.log(`   • ${id}`));
  }
}

// ===== 6. 정렬 확인 =====
console.log('\n📊 데이터 순서 확인...');
const expectedIds = [];
const minId = Math.min(...videoIds.map(Number));
const maxId = Math.max(...videoIds.map(Number));

console.log(`   범위: ${minId} ~ ${maxId}`);
console.log(`   개수: ${videoIds.length}개`);

let gaps = [];
for (let i = minId; i <= maxId; i++) {
  const idStr = i.toString();
  if (!videoIds.includes(idStr)) {
    gaps.push(i);
  }
}

if (gaps.length > 0) {
  console.log(`⚠️  누락된 ID: ${gaps.length}개`);
  if (verbose && gaps.length <= 20) {
    gaps.forEach(g => console.log(`   • ${g}`));
  } else if (gaps.length > 20) {
    console.log(`   • ${gaps.slice(0, 10).join(', ')} ... 등 ${gaps.length - 10}개 더`);
  }
}

// ===== 7. 최종 리포트 =====
console.log('\n═══════════════════════════════════════════════════');
console.log('📊 검증 결과 요약');
console.log('═══════════════════════════════════════════════════\n');

console.log('📈 통계:');
console.log(`  📹 영상 파일: ${videoFiles.length}개`);
console.log(`  📋 JSON 파일: ${jsonFiles.length}개`);
console.log(`  ✅ 완벽한 매칭: ${matched}개`);
console.log(`  ⚠️  문제 있는 매칭: ${videoIds.length - matched}개`);
console.log(`      - JSON 없음: ${noJsonCount}개`);
console.log(`      - JSON 파싱 오류: ${invalidJsonCount}개`);
console.log(`      - name 필드 없음: ${noNameCount}개`);
console.log(`      - 영상 없는 JSON: ${orphanedJson}개`);

if (gaps.length > 0) {
  console.log(`\n⚠️  ID 누락: ${gaps.length}개`);
}

const successRate = ((matched / videoFiles.length) * 100).toFixed(1);
console.log(`\n🎯 성공률: ${successRate}%`);

if (issues.length > 0 && issues.length <= 20) {
  console.log('\n🔴 발견된 문제:');
  issues.slice(0, 10).forEach(issue => {
    console.log(`  • ${issue}`);
  });
  if (issues.length > 10) {
    console.log(`  ... 등 ${issues.length - 10}개 더`);
  }
}

// ===== 8. 추천사항 =====
console.log('\n💡 추천사항:');

if (matched === videoFiles.length) {
  console.log('✅ 모든 파일이 올바르게 매칭됩니다!');
  console.log('   → npm run batch-learn 으로 자동 학습을 시작할 수 있습니다.');
} else {
  const issues = [];
  
  if (noJsonCount > 0) {
    issues.push(`${noJsonCount}개 파일의 JSON 메타데이터 확인`);
  }
  if (invalidJsonCount > 0) {
    issues.push(`${invalidJsonCount}개 JSON 파일의 형식 확인`);
  }
  if (noNameCount > 0) {
    issues.push(`${noNameCount}개 JSON에서 name 필드 추가`);
  }
  
  console.log(`⚠️  다음을 확인한 후 자동 학습을 시작하세요:`);
  issues.forEach(issue => console.log(`   • ${issue}`));
}

if (orphanedJson > 0) {
  console.log(`\n💾 정리:`);
  console.log(`   → ${orphanedJson}개의 고아 JSON 파일을 17 폴더에서 정리할 수 있습니다.`);
}

console.log('\n상세한 검증을 위해 --verbose 플래그를 사용하세요:');
console.log('  npm run validate-data -- --verbose\n');

// 종료 코드
process.exit(matched === videoFiles.length ? 0 : 1);
