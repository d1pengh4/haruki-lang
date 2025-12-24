#!/usr/bin/env node

/**
 * 간단한 배치 학습 스크립트
 *
 * 현재 웹 앱의 학습 기능을 자동화합니다.
 * - 브라우저로 웹앱 접속
 * - 영상 파일 업로드
 * - MediaPipe 처리 대기
 * - 수화 이름 입력 및 저장
 */

import puppeteer from 'puppeteer';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const VIDEO_DIR = join(rootDir, '02');
const JSON_DIR = join(rootDir, '17');

const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * JSON에서 수화 이름 가져오기
 */
function getSignName(videoNumber) {
  const jsonPath = join(JSON_DIR, `${videoNumber}.json`);
  if (!existsSync(jsonPath)) return null;

  try {
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    return data.data[0]?.attributes[0]?.name || null;
  } catch {
    return null;
  }
}

/**
 * 비디오 처리
 */
async function processVideo(page, videoNumber, signName, index, total) {
  const videoPath = join(VIDEO_DIR, `${videoNumber}.mp4`);

  console.log(`\n[${index}/${total}] 🎬 처리 중: ${videoNumber} - ${signName}`);

  try {
    // 학습 모드로 이동 (이미 학습 모드라고 가정)
    console.log('  ⏳ 페이지 준비 중...');

    // 파일 입력 찾기
    const fileInput = await page.$('#video-upload') || await page.$('input[type="file"][accept*="video"]');
    if (!fileInput) {
      console.error('  ❌ 파일 입력을 찾을 수 없습니다');
      return false;
    }

    // 파일 업로드
    console.log('  📤 파일 업로드 중...');
    await fileInput.uploadFile(videoPath);

    // 비디오 처리 시작 버튼 클릭
    await delay(2000);
    const processButtonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b =>
        b.textContent.includes('비디오 처리 시작') ||
        b.textContent.includes('처리 시작')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (processButtonClicked) {
      console.log('  🎥 비디오 처리 시작...');
    }

    // 처리 완료 대기 (최대 2분)
    console.log('  🤖 MediaPipe 처리 중...');
    let processed = false;
    for (let i = 0; i < 120; i++) {
      await delay(1000);

      // 진행률 체크
      const progress = await page.evaluate(() => {
        const progressText = document.body.textContent;
        if (progressText.includes('100%') || progressText.includes('완료')) {
          return 100;
        }
        const match = progressText.match(/(\d+)%/);
        return match ? parseInt(match[1]) : 0;
      });

      if (progress === 100) {
        processed = true;
        console.log('  ✅ 처리 완료!');
        break;
      } else if (progress > 0) {
        process.stdout.write(`\r  진행: ${progress}%`);
      }
    }

    if (!processed) {
      console.error('\n  ❌ 처리 시간 초과');
      return false;
    }

    console.log('');

    // 수화 이름 입력
    await delay(1000);
    const nameInput = await page.$('input[placeholder*="수화"]') || await page.$('input[type="text"]');
    if (nameInput) {
      console.log(`  ✍️  수화 이름 입력: ${signName}`);
      await nameInput.click({ clickCount: 3 }); // 기존 텍스트 선택
      await nameInput.type(signName);
    }

    // 저장 버튼 클릭
    await delay(500);
    const saveButtonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b =>
        b.textContent.includes('저장') &&
        !b.textContent.includes('취소')
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (saveButtonClicked) {
      console.log('  💾 저장 중...');
      await delay(2000);
      console.log('  ✅ 저장 완료!');
    } else {
      console.error('  ❌ 저장 버튼을 찾을 수 없습니다');
      return false;
    }

    return true;

  } catch (error) {
    console.error(`  ❌ 오류: ${error.message}`);
    return false;
  }
}

/**
 * 메인 함수
 */
async function main() {
  const args = process.argv.slice(2);
  let startNum = 1501;
  let endNum = 1505;

  if (args.length >= 2) {
    startNum = parseInt(args[0]);
    endNum = parseInt(args[1]);
  } else if (args.length === 1) {
    startNum = parseInt(args[0]);
    endNum = startNum;
  }

  console.log('🚀 배치 학습 시작');
  console.log(`📂 비디오 범위: ${startNum} ~ ${endNum}`);
  console.log('');
  console.log('⚠️  주의: 개발 서버(npm run dev)가 실행 중이어야 합니다!');
  console.log('');

  // 처리할 비디오 목록
  const videos = [];
  for (let num = startNum; num <= endNum; num++) {
    const numStr = num.toString().padStart(4, '0');
    const videoPath = join(VIDEO_DIR, `${numStr}.mp4`);
    const signName = getSignName(numStr);

    if (!existsSync(videoPath)) {
      console.log(`⏭️  ${numStr}: 비디오 파일 없음`);
      continue;
    }

    if (!signName) {
      console.log(`⏭️  ${numStr}: JSON 파일 없음 또는 이름 없음`);
      continue;
    }

    videos.push({ number: numStr, name: signName });
  }

  if (videos.length === 0) {
    console.error('❌ 처리할 비디오가 없습니다');
    process.exit(1);
  }

  console.log(`📋 ${videos.length}개 비디오 처리 예정\n`);

  // 브라우저 실행
  console.log('🌐 브라우저 실행 중...');
  const browser = await puppeteer.launch({
    headless: false, // UI를 보면서 진행
    defaultViewport: { width: 1280, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 개발 서버 접속
  console.log('🔗 개발 서버 접속 중...');
  const ports = [5173, 5175, 3000, 5174];
  let connected = false;

  for (const port of ports) {
    try {
      await page.goto(`http://localhost:${port}`, {
        waitUntil: 'networkidle2',
        timeout: 10000
      });
      const url = page.url();
      if (!url.includes('about:blank')) {
        console.log(`✅ 연결됨: http://localhost:${port}`);
        connected = true;
        break;
      }
    } catch (err) {
      continue;
    }
  }

  if (!connected) {
    console.error('❌ 개발 서버에 연결할 수 없습니다');
    console.error('   npm run dev를 먼저 실행해주세요');
    await browser.close();
    process.exit(1);
  }

  // 학습 모드로 이동
  await delay(2000);
  console.log('📚 학습 모드로 이동...');
  const learnButtonClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('수화 학습하기'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (learnButtonClicked) {
    await delay(2000);
  }

  // 영상 업로드 모드 선택
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const uploadBtn = buttons.find(btn =>
        btn.textContent.includes('영상 업로드') ||
        btn.textContent.includes('비디오 업로드') ||
        btn.textContent.includes('파일')
      );
      if (uploadBtn) uploadBtn.click();
    });
    await delay(1000);
  } catch {}

  console.log('✅ 준비 완료\n');

  // 비디오 처리
  let success = 0;
  let failed = 0;
  const failedList = [];

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const result = await processVideo(page, video.number, video.name, i + 1, videos.length);

    if (result) {
      success++;
    } else {
      failed++;
      failedList.push(video.number);
    }

    // 다음 비디오를 위해 페이지 새로고침 (선택사항)
    if (i < videos.length - 1) {
      console.log('  🔄 페이지 준비 중...');
      await delay(2000);
    }
  }

  // 결과 출력
  console.log('\n\n🎉 배치 학습 완료!');
  console.log(`총 처리: ${videos.length}`);
  console.log(`✅ 성공: ${success}`);
  console.log(`❌ 실패: ${failed}`);

  if (failedList.length > 0) {
    console.log(`\n실패 목록: ${failedList.join(', ')}`);
  }

  // 브라우저를 닫지 않고 유지 (사용자가 결과 확인 가능)
  console.log('\n브라우저를 열어둡니다. 종료하려면 Ctrl+C를 누르세요.');
}

main().catch(error => {
  console.error('❌ 치명적 오류:', error);
  process.exit(1);
});
