#!/usr/bin/env node

/**
 * Puppeteer 연결 테스트 스크립트
 * 브라우저가 제대로 페이지를 로드할 수 있는지 확인
 */

import puppeteer from 'puppeteer';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testConnection() {
  console.log('🧪 Puppeteer 연결 테스트 시작\n');

  let browser;
  
  try {
    console.log('1️⃣  브라우저 실행 중...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1400, height: 900 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-gpu'
      ]
    });
    console.log('✅ 브라우저 실행 완료\n');

    const page = await browser.newPage();
    console.log('2️⃣  페이지 생성 중...');
    console.log('✅ 페이지 생성 완료\n');

    console.log('3️⃣  포트별 연결 테스트:\n');
    const ports = [5173, 5175, 3000];
    let connected = false;

    for (const port of ports) {
      try {
        console.log(`   🔗 localhost:${port}에 연결 시도...`);
        await page.goto(`http://localhost:${port}`, {
          waitUntil: 'networkidle2',
          timeout: 10000
        });
        
        const title = await page.title();
        const url = page.url();
        
        console.log(`   ✅ 연결 성공!`);
        console.log(`      URL: ${url}`);
        console.log(`      Title: ${title}\n`);
        
        connected = true;
        break;
      } catch (err) {
        console.log(`   ❌ 연결 실패: ${err.message}\n`);
      }
    }

    if (connected) {
      console.log('4️⃣  페이지 내용 검증:\n');
      
      const hasButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const learnBtn = buttons.find(btn => btn.textContent.includes('수화 학습하기'));
        return !!learnBtn;
      });

      if (hasButton) {
        console.log('   ✅ "수화 학습하기" 버튼 발견!');
      } else {
        console.log('   ⚠️  "수화 학습하기" 버튼을 찾을 수 없음');
      }

      console.log('\n✨ 모든 테스트 완료!\n');
      console.log('결론: Puppeteer가 정상 작동합니다.');
      console.log('배치 학습 스크립트를 실행할 수 있습니다.\n');
      
    } else {
      console.log('❌ 어느 포트에도 연결할 수 없습니다.');
      console.log('\n다음을 확인하세요:');
      console.log('1. Vite 개발 서버가 실행 중인가?');
      console.log('   → npm run dev\n');
      console.log('2. 실행 중인 포트가 맞는가?');
      console.log('   → ps aux | grep vite\n');
      console.log('3. 방화벽 설정 확인\n');
    }

    await page.close();
    
  } catch (err) {
    console.error('❌ 테스트 중 오류:', err.message);
  } finally {
    if (browser) {
      console.log('🛑 브라우저 종료...\n');
      await browser.close();
    }
  }
}

testConnection().catch(console.error);
