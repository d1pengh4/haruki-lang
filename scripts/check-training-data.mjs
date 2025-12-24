#!/usr/bin/env node

/**
 * 학습된 수화 데이터 확인 스크립트
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('📊 학습된 수화 데이터 확인\n');
console.log('='.repeat(70));

try {
  const { data: signs, error } = await supabase
    .from('sign_languages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ 데이터 조회 실패:', error.message);
    process.exit(1);
  }

  if (!signs || signs.length === 0) {
    console.log('\n⚠️  저장된 수화 데이터가 없습니다.\n');
    process.exit(0);
  }

  console.log(`\n✅ 총 ${signs.length}개의 수화가 저장되어 있습니다.\n`);

  signs.forEach((sign, index) => {
    console.log(`${index + 1}. ${sign.name}`);
    console.log(`   ID: ${sign.id}`);
    console.log(`   생성일: ${new Date(sign.created_at).toLocaleString('ko-KR')}`);
    console.log(`   지속시간: ${sign.duration?.toFixed(2) || 'N/A'}초`);

    // 랜드마크 시퀀스 확인
    const sequence = sign.landmarks_sequence;
    if (sequence && Array.isArray(sequence)) {
      console.log(`   프레임 수: ${sequence.length}개`);

      // 첫 번째 프레임 검사
      const firstFrame = sequence[0];
      if (firstFrame) {
        const hasLeftHand = firstFrame.left_hand_features && firstFrame.left_hand_features.length > 0;
        const hasRightHand = firstFrame.right_hand_features && firstFrame.right_hand_features.length > 0;
        const hasPose = firstFrame.pose_features && firstFrame.pose_features.length > 0;

        console.log(`   특징 데이터:`);
        console.log(`     - 왼손: ${hasLeftHand ? '✓ (' + firstFrame.left_hand_features.length + '개)' : '❌ 없음'}`);
        console.log(`     - 오른손: ${hasRightHand ? '✓ (' + firstFrame.right_hand_features.length + '개)' : '❌ 없음'}`);
        console.log(`     - 포즈: ${hasPose ? '✓ (' + firstFrame.pose_features.length + '개)' : '❌ 없음'}`);

        if (!hasLeftHand && !hasRightHand) {
          console.log(`   ⚠️  경고: 손 특징이 없습니다! 인식이 어려울 수 있습니다.`);
        }
      }
    } else {
      console.log(`   ❌ 랜드마크 시퀀스 없음`);
    }

    console.log('');
  });

  console.log('='.repeat(70));
  console.log('\n💡 Tip:');
  console.log('- 손 특징이 없는 경우 영상이 제대로 처리되지 않은 것입니다.');
  console.log('- 프레임 수가 5개 미만이면 인식이 불가능합니다.');
  console.log('- 브라우저 콘솔에서 "🔍 인식 결과" 로그를 확인하여 유사도를 체크하세요.\n');

} catch (error) {
  console.error('❌ 오류 발생:', error.message);
  process.exit(1);
}
