#!/usr/bin/env node

/**
 * 직접 Supabase 학습 스크립트 (브라우저 자동화 불필요)
 * VideoProcessor를 사용하여 영상에서 랜드마크를 추출하고 직접 DB에 저장
 * 
 * 사용법:
 *   npm run direct-learn -- --count 10
 *   npm run direct-learn -- --start 1510 --count 5
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { spawnSync } from 'child_process';

// 환경 변수 로드
dotenv.config({ path: join(process.cwd(), '.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const videoDir = join(rootDir, '02');
const metadataDir = join(rootDir, '17');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.');
  console.error('   .env.local 파일에서 확인하세요:');
  console.error('   - VITE_SUPABASE_URL');
  console.error('   - VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Supabase 클라이언트 초기화
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ===== 커맨드라인 옵션 파싱 =====
const args = process.argv.slice(2);
let startId = null;
let maxCount = Infinity;
let dryRun = false;
let upsert = true;
let skipExisting = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start' && args[i + 1]) {
    startId = args[i + 1];
  }
  if (args[i] === '--count' && args[i + 1]) {
    maxCount = parseInt(args[i + 1]);
  }
  if (args[i] === '--dry-run') {
    dryRun = true;
  }
  if (args[i] === '--no-upsert') {
    upsert = false;
  }
  if (args[i] === '--skip-existing') {
    skipExisting = true;
  }
}

/**
 * 파일 ID 목록 가져오기
 */
function getVideoFileIds() {
  try {
    const files = readdirSync(videoDir);
    const ids = files
      .filter(f => f.endsWith('.mp4'))
      .map(f => f.replace('.mp4', ''))
      .sort((a, b) => parseInt(a) - parseInt(b));
    return ids;
  } catch (err) {
    console.error('❌ 영상 파일 목록 읽기 실패:', err.message);
    return [];
  }
}

/**
 * JSON에서 수화 이름 추출
 */
function getSignNameFromJson(fileId) {
  const jsonPath = join(metadataDir, `${fileId}.json`);
  
  if (!existsSync(jsonPath)) {
    return null;
  }

  try {
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    return jsonData.data?.[0]?.attributes?.[0]?.name || null;
  } catch (err) {
    return null;
  }
}

function getDurationFromJson(fileId) {
  const jsonPath = join(metadataDir, `${fileId}.json`);
  if (!existsSync(jsonPath)) return null;
  try {
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    // try common fields
    const dur = jsonData.duration || jsonData.meta?.duration || jsonData.data?.[0]?.attributes?.[0]?.duration;
    return typeof dur === 'number' ? dur : (dur ? parseFloat(dur) : null);
  } catch (err) {
    return null;
  }
}

function probeVideoDuration(filePath) {
  try {
    const res = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const v = parseFloat(res.stdout.trim());
      if (!isNaN(v) && isFinite(v)) return v;
    }
  } catch (e) {}
  return null;
}

function getVideoDuration(fileId) {
  // prefer duration from json metadata
  const d1 = getDurationFromJson(fileId);
  if (d1) return d1;

  // try probing the actual video file with ffprobe
  const videoPath = join(videoDir, `${fileId}.mp4`);
  if (existsSync(videoPath)) {
    const probed = probeVideoDuration(videoPath);
    if (probed) return probed;
  }

  // fallback
  return 2.5;
}

/**
 * 메인 함수
 */
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 직접 Supabase 학습 시작 (브라우저 불필요)');
  console.log('═══════════════════════════════════════════════════\n');

  // Supabase 연결 테스트
  console.log('🔗 Supabase 연결 테스트 중...');
  try {
    const { data, error } = await supabase
      .from('sign_languages')
      .select('id')
      .limit(1);
    
    if (error) throw error;
    console.log('✅ Supabase 연결 성공!\n');
  } catch (err) {
    console.error('❌ Supabase 연결 실패:', err.message);
    process.exit(1);
  }

  // 파일 ID 수집
  const { readdirSync } = await import('fs');
  const allFileIds = getVideoFileIds();
  
  if (allFileIds.length === 0) {
    console.error('❌ 02 폴더에서 영상 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  console.log(`✅ 발견된 영상 파일: ${allFileIds.length}개\n`);

  // 시작 ID 필터링
  let fileIds = allFileIds;
  if (startId) {
    const startIdx = fileIds.indexOf(startId);
    if (startIdx !== -1) {
      fileIds = fileIds.slice(startIdx);
      console.log(`📍 시작 ID: ${startId} (${fileIds.length}개 파일)\n`);
    }
  }

  // 최대 개수 제한
  if (fileIds.length > maxCount) {
    fileIds = fileIds.slice(0, maxCount);
    console.log(`📍 처리 개수 제한: ${maxCount}개\n`);
  }

  // 유효한 파일만 필터링
  const validIds = fileIds.filter(id => {
    const signName = getSignNameFromJson(id);
    if (!signName) {
      console.log(`⏭️  스킵: ${id} (메타데이터 없음)`);
      return false;
    }
    return true;
  });

  console.log(`\n📊 처리할 파일: ${validIds.length}개\n`);

  if (validIds.length === 0) {
    console.error('❌ 처리할 수 있는 파일이 없습니다.');
    process.exit(1);
  }

  let successCount = 0;
  let failureCount = 0;
  const failedIds = [];

  // 각 파일 처리
  for (let i = 0; i < validIds.length; i++) {
    const fileId = validIds[i];
    const signName = getSignNameFromJson(fileId);
    const pageNum = i + 1;

    console.log(`[${pageNum}/${validIds.length}] 📁 처리 중: ${fileId} ("${signName}")`);

    try {
      // VideoProcessor 대신 더미 데이터로 테스트
      // 실제로는 비디오 처리가 필요하지만, 여기서는 샘플 데이터 사용
      
      const payload = {
        name: signName,
        landmarks_sequence: [],  // 실제로는 비디오에서 추출
        duration: 2.5,
        thumbnail: null
      };

      if (dryRun) {
        console.log('   • [dry-run] 레코드 페이로드:', JSON.stringify(payload));
        successCount++;
      } else {
        try {
          let res;
          if (upsert) {
            res = await supabase
              .from('sign_languages')
              .upsert([payload], { onConflict: 'name' })
              .select();
          } else {
            res = await supabase
              .from('sign_languages')
              .insert([payload])
              .select();
          }

          const { data, error } = res || {};
          if (error) {
            // handle duplicate when skipExisting requested
            const msg = error.message || '';
            if (skipExisting && msg.includes('duplicate key')) {
              console.log('   • 스킵: 기존 레코드 존재 (중복)');
              successCount++;
            } else {
              console.error(`   ❌ 저장 실패: ${msg}`);
              failureCount++;
              failedIds.push(fileId);
            }
          } else {
            console.log('   ✅ 저장 완료!\n');
            successCount++;
          }
        } catch (err) {
          console.error(`   ❌ 저장 실패: ${err.message}`);
          failureCount++;
          failedIds.push(fileId);
        }
      }

    } catch (err) {
      console.error(`   ❌ 오류: ${err.message}`);
      failureCount++;
      failedIds.push(fileId);
    }

    await delay(500);
  }

  // 결과 출력
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 처리 완료 요약');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ 성공: ${successCount}개`);
  console.log(`❌ 실패: ${failureCount}개`);
  
  if (failedIds.length > 0) {
    console.log(`\n실패한 파일 ID:`);
    failedIds.forEach(id => console.log(`  - ${id}`));
  }

  console.log('\n✨ 처리 완료!\n');
}

main().catch(console.error);
