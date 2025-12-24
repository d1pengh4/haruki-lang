#!/usr/bin/env node

/**
 * 자동 수화 학습 스크립트 (Puppeteer 사용)
 * 브라우저를 자동화하여 영상 파일을 업로드하고 학습시킵니다.
 */

import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 학습할 파일 ID 목록
const fileIds = ['1501', '1502', '1503'];

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🚀 자동 수화 학습 시작...\n');

  // 브라우저 실행
  const browser = await puppeteer.launch({
    headless: false, // 브라우저 UI 표시
    defaultViewport: { width: 1920, height: 1080 }
  });

  const page = await browser.newPage();

  // 개발 서버 접속
  console.log('🌐 개발 서버 접속 중...');
  await page.goto('http://localhost:5175', { waitUntil: 'networkidle0' });
  await delay(2000);

  for (const fileId of fileIds) {
    const videoPath = join(rootDir, '02', `${fileId}.mp4`);
    const jsonPath = join(rootDir, '17', `${fileId}.json`);

    console.log(`\n📁 처리 중: ${fileId}`);

    try {
      // JSON 파일 읽기
      const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const signName = jsonData.data[0]?.attributes[0]?.name;

      if (!signName) {
        console.error(`   ❌ JSON 파일에서 수화 이름을 찾을 수 없습니다.`);
        continue;
      }

      console.log(`   ✅ 수화 이름: ${signName}`);
      console.log(`   📹 영상: ${videoPath}`);

      // "수화 학습하기" 버튼 클릭
      console.log('   🔘 "수화 학습하기" 버튼 클릭...');
      await page.waitForSelector('button:has-text("수화 학습하기")', { timeout: 5000 });
      await page.click('button:has-text("수화 학습하기")');
      await delay(1000);

      // "영상 업로드" 탭 클릭
      console.log('   🔘 "영상 업로드" 탭 클릭...');
      await page.waitForSelector('button:has-text("영상 업로드")', { timeout: 5000 });
      await page.click('button:has-text("영상 업로드")');
      await delay(500);

      // 파일 업로드
      console.log('   📤 파일 업로드 중...');
      const fileInput = await page.$('input[type="file"]');
      await fileInput.uploadFile(videoPath);
      await delay(2000);

      // "비디오 처리 시작" 버튼 클릭
      console.log('   ▶️  비디오 처리 시작...');
      await page.waitForSelector('button:has-text("비디오 처리 시작")', { timeout: 5000 });
      await page.click('button:has-text("비디오 처리 시작")');

      // 처리 완료 대기 (최대 60초)
      console.log('   ⏳ 비디오 처리 대기 중...');
      let processed = false;
      for (let i = 0; i < 60; i++) {
        await delay(1000);
        const completeText = await page.evaluate(() => {
          const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
          return alerts.some(el => el.textContent.includes('비디오 처리 완료'));
        });
        if (completeText) {
          processed = true;
          break;
        }
        if (i % 5 === 0) {
          console.log(`   ⏳ ${i}초 경과...`);
        }
      }

      if (!processed) {
        console.error('   ❌ 비디오 처리 시간 초과');
        continue;
      }

      console.log('   ✅ 비디오 처리 완료!');

      // 수화 이름 입력
      console.log(`   ✍️  수화 이름 입력: ${signName}`);
      await page.waitForSelector('input#sign-name', { timeout: 5000 });
      await page.type('input#sign-name', signName);
      await delay(500);

      // "수화 저장하기" 버튼 클릭
      console.log('   💾 저장 중...');
      await page.waitForSelector('button:has-text("수화 저장하기")', { timeout: 5000 });
      await page.click('button:has-text("수화 저장하기")');
      await delay(2000);

      // 저장 완료 확인
      const saved = await page.evaluate(() => {
        const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
        return alerts.some(el => el.textContent.includes('성공적으로 저장'));
      });

      if (saved) {
        console.log(`   ✅ "${signName}" 저장 완료!\n`);
      } else {
        console.error('   ❌ 저장 실패\n');
      }

      // 다이얼로그 닫기
      await page.keyboard.press('Escape');
      await delay(1000);

    } catch (error) {
      console.error(`   ❌ 오류 발생:`, error.message);
      // 에러 시 다이얼로그 닫기 시도
      await page.keyboard.press('Escape');
      await delay(1000);
    }
  }

  console.log('\n✨ 모든 파일 처리 완료!');
  console.log('브라우저를 5초 후에 닫습니다...');
  await delay(5000);

  await browser.close();
}

main().catch(console.error);
