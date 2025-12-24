#!/usr/bin/env node

/**
 * 기존 수화 데이터의 손 특징 벡터 재계산 스크립트
 *
 * 카메라로 학습한 오래된 데이터는 손 특징이 객체 형태로 저장되어 있어
 * 배열로 변환해야 인식이 제대로 됩니다.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

dotenv.config({ path: join(rootDir, '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 손 특징 객체를 배열로 변환
 */
function flattenHandFeatures(features) {
  if (!features) return null;

  // 이미 배열이면 그대로 반환
  if (Array.isArray(features)) return features;

  // 객체라면 배열로 변환
  if (typeof features === 'object') {
    return [
      ...(features.fingerExtensions || []),
      ...(features.fingerAngles || []),
      ...(features.fingerTipDistances || []),
      ...(features.handShapeRatios || []),
      ...(features.fingerBendAngles || [])
    ];
  }

  return null;
}

async function main() {
  console.log('🔧 기존 수화 데이터 수정 중...\n');

  // 모든 수화 데이터 가져오기
  const { data: signs, error } = await supabase
    .from('sign_languages')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ 데이터 조회 실패:', error.message);
    process.exit(1);
  }

  if (!signs || signs.length === 0) {
    console.log('📭 수화 데이터가 없습니다.');
    process.exit(0);
  }

  console.log(`📊 총 ${signs.length}개 수화 데이터 발견\n`);

  let updated = 0;
  let alreadyFixed = 0;
  let noHands = 0;

  for (const sign of signs) {
    console.log(`\n처리 중: ${sign.name} (${sign.id.substring(0, 8)}...)`);

    if (!sign.landmarks_sequence || sign.landmarks_sequence.length === 0) {
      console.log('  ⏭️  랜드마크 시퀀스 없음');
      continue;
    }

    let needsUpdate = false;
    const updatedSequence = sign.landmarks_sequence.map(frame => {
      // 손 특징 벡터 체크
      const leftIsArray = Array.isArray(frame.left_hand_features);
      const rightIsArray = Array.isArray(frame.right_hand_features);
      const leftIsObject = frame.left_hand_features && typeof frame.left_hand_features === 'object' && !leftIsArray;
      const rightIsObject = frame.right_hand_features && typeof frame.right_hand_features === 'object' && !rightIsArray;

      if (leftIsObject || rightIsObject) {
        needsUpdate = true;

        return {
          ...frame,
          left_hand_features: flattenHandFeatures(frame.left_hand_features),
          right_hand_features: flattenHandFeatures(frame.right_hand_features)
        };
      }

      return frame;
    });

    // 손 감지 통계
    const framesWithHands = updatedSequence.filter(
      f => f.left_hand_features || f.right_hand_features
    ).length;
    const detectionRate = (framesWithHands / updatedSequence.length * 100).toFixed(1);

    console.log(`  프레임: ${updatedSequence.length}개`);
    console.log(`  손 감지율: ${detectionRate}%`);

    if (framesWithHands === 0) {
      console.log(`  ⚠️  손이 하나도 감지되지 않음 - 삭제 또는 재학습 필요`);
      noHands++;
      continue;
    }

    if (needsUpdate) {
      console.log(`  🔄 특징 벡터 변환 중...`);

      const { error: updateError } = await supabase
        .from('sign_languages')
        .update({ landmarks_sequence: updatedSequence })
        .eq('id', sign.id);

      if (updateError) {
        console.error(`  ❌ 업데이트 실패: ${updateError.message}`);
      } else {
        console.log(`  ✅ 업데이트 완료`);
        updated++;
      }
    } else {
      console.log(`  ✓ 이미 수정됨`);
      alreadyFixed++;
    }
  }

  console.log('\n\n📊 결과 요약:');
  console.log(`  총 수화: ${signs.length}개`);
  console.log(`  ✅ 업데이트됨: ${updated}개`);
  console.log(`  ✓ 이미 수정됨: ${alreadyFixed}개`);
  console.log(`  ⚠️  손 없음: ${noHands}개`);

  if (noHands > 0) {
    console.log('\n⚠️  손이 감지되지 않은 수화는 삭제하거나 다시 학습하는 것을 권장합니다.');
  }

  console.log('\n✨ 완료!');
}

main().catch(error => {
  console.error('❌ 오류:', error);
  process.exit(1);
});
