#!/usr/bin/env node

/**
 * 배치 자동 수화 학습 스크립트
 * 02 폴더의 영상 파일과 17 폴더의 JSON 메타데이터를 자동으로 매칭하여 학습
 * 
 * 사용법:
 *   npm run batch-learn                    # 모든 파일 처리
 *   npm run batch-learn -- --start 1501    # 특정 ID부터 시작
 *   npm run batch-learn -- --count 10      # 처음 10개만 처리
 */

import puppeteer from 'puppeteer';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// ===== 설정 =====
const videoDir = join(rootDir, '02');
const metadataDir = join(rootDir, '17');
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 포트가 실제로 실행 중인지 확인
 */
async function checkPort(port, timeout = 3000) {
  const http = await import('http');
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: 'localhost', port, path: '/', method: 'HEAD' },
      (res) => {
        resolve(true);
      }
    );
    req.on('error', () => {
      resolve(false);
    });
    req.setTimeout(timeout);
    req.end();
  });
}

/**
 * 실행 중인 포트 찾기
 */
async function findActivePort() {
  const ports = [5173, 5175, 3000, 5174];
  console.log('   🔍 포트 검색 중...');
  
  for (const port of ports) {
    const isActive = await checkPort(port);
    if (isActive) {
      console.log(`   ✓ 포트 ${port} 활성 상태 감지됨`);
      return port;
    }
  }
  return 5173; // 기본값
}

// ===== 커맨드라인 옵션 파싱 =====
const args = process.argv.slice(2);
let startId = null;
let maxCount = Infinity;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--start' && args[i + 1]) {
    startId = args[i + 1];
  }
  if (args[i] === '--count' && args[i + 1]) {
    maxCount = parseInt(args[i + 1]);
  }
}

/**
 * 02 폴더에서 모든 영상 파일 ID 가져오기
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
 * JSON 파일에서 수화 이름 추출
 */
function getSignNameFromJson(fileId) {
  const jsonPath = join(metadataDir, `${fileId}.json`);
  
  if (!existsSync(jsonPath)) {
    console.warn(`   ⚠️  JSON 파일 없음: ${fileId}.json`);
    return null;
  }

  try {
    const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    
    // 17폴더 JSON 포맷: data[0].attributes[0].name
    if (jsonData.data && Array.isArray(jsonData.data) && jsonData.data.length > 0) {
      const signName = jsonData.data[0]?.attributes?.[0]?.name;
      if (signName) {
        return signName;
      }
    }
    
    console.warn(`   ⚠️  JSON에서 이름 찾을 수 없음: ${fileId}.json`);
    return null;
  } catch (err) {
    console.error(`   ❌ JSON 파싱 실패: ${fileId}.json -`, err.message);
    return null;
  }
}

/**
 * 비디오 파일이 존재하는지 확인
 */
function videoExists(fileId) {
  return existsSync(join(videoDir, `${fileId}.mp4`));
}

/**
 * Puppeteer로 자동 학습 실행
 */
async function learnSignWithPuppeteer(browser, fileId, signName, pageNum, totalCount) {
  const videoPath = join(videoDir, `${fileId}.mp4`);
  const page = await browser.newPage();
  
  try {
    console.log(`\n[${pageNum}/${totalCount}] 📁 처리 중: ${fileId} ("${signName}")`);
    
    // 실행 중인 포트 찾기
    console.log('   🌐 페이지 로드 중...');
    const activePort = await findActivePort();
    
    // 페이지 로드 시도
    let pageLoaded = false;
    let lastError = null;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `http://localhost:${activePort}`;
        console.log(`   시도 ${attempt + 1}/3: ${url}`);
        
        await page.goto(url, { 
          waitUntil: 'domcontentloaded',
          timeout: 15000 
        });
        
        // URL 확인
        const currentUrl = page.url();
        console.log(`   현재 URL: ${currentUrl}`);
        
        if (currentUrl === 'about:blank' || !currentUrl.includes('localhost')) {
          console.warn(`   ⚠️  잘못된 URL: ${currentUrl}, 재시도...`);
          await delay(1000);
          continue;
        }
        
        pageLoaded = true;
        console.log(`   ✅ 포트 ${activePort}에서 로드 완료`);
        break;
        
      } catch (err) {
        lastError = err.message;
        console.warn(`   ⚠️  시도 ${attempt + 1} 실패: ${err.message}`);
        await delay(2000);
      }
    }
    
    if (!pageLoaded) {
      console.error(`   ❌ 페이지 로드 실패: ${lastError}`);
      return false;
    }

    // "수화 학습하기" 버튼 클릭 (재시도 로직 포함)
    console.log('   🔘 "수화 학습하기" 버튼 클릭...');
    let learnButtonClicked = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const learnBtn = buttons.find(btn => btn.textContent.includes('수화 학습하기'));
          if (learnBtn) {
            learnBtn.click();
            return true;
          }
          return false;
        });
        
        if (result) {
          learnButtonClicked = true;
          break;
        }
      } catch (err) {
        console.warn(`   ⚠️  시도 ${attempt + 1}/3 실패`);
        await delay(500);
      }
    }

    if (!learnButtonClicked) {
      console.error('   ❌ "수화 학습하기" 버튼을 찾을 수 없습니다.');
      return false;
    }

    await delay(1500);

    // "영상 업로드" 탭 클릭
    console.log('   🔘 "영상 업로드" 탭 클릭...');
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const videoUploadBtn = buttons.find(btn => 
          btn.textContent.includes('영상 업로드') || btn.textContent.includes('비디오 업로드')
        );
        if (videoUploadBtn) {
          videoUploadBtn.click();
        }
      });
      await delay(800);
    } catch (err) {
      console.warn('   ⚠️  영상 업로드 탭 전환 실패 (이미 선택되어 있을 수 있음)');
    }

    // 파일 입력 필드 찾기 및 파일 업로드
    console.log('   📤 파일 업로드 중...');
    let uploadSuccess = false;
    try {
      // #video-upload ID로 파일 업로드
      const fileInput = await page.$('#video-upload');
      if (fileInput) {
        await fileInput.uploadFile(videoPath);
        uploadSuccess = true;
        await delay(2000);
      } else {
        // ID가 없으면 input[type="file"] 찾기
        const fileInputGeneric = await page.$('input[type="file"]');
        if (fileInputGeneric) {
          await fileInputGeneric.uploadFile(videoPath);
          uploadSuccess = true;
          await delay(2000);
        }
      }
    } catch (err) {
      console.warn('   ⚠️  파일 업로드 중 오류:', err.message);
    }

    if (!uploadSuccess) {
      console.error('   ❌ 파일 업로드 실패');
      return false;
    }

    // VideoProcessor가 자동으로 시작될 때까지 대기
    console.log('   ⏳ 비디오 처리 대기 중... (최대 120초)');
    let processingComplete = false;
    
    for (let i = 0; i < 120; i++) {
      await delay(1000);
      
      try {
        const isComplete = await page.evaluate(() => {
          const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
          return alerts.some(el => 
            el.textContent.includes('처리 완료') || 
            el.textContent.includes('처리가 완료')
          );
        });
        
        if (isComplete) {
          processingComplete = true;
          console.log('   ✅ 비디오 처리 완료!');
          break;
        }
      } catch (err) {
        // 평가 중 오류 무시
      }
      
      if (i % 20 === 0 && i > 0) {
        process.stdout.write(`   ⏳ ${i}초 경과...\n`);
      }
    }

    if (!processingComplete) {
      console.warn('   ⚠️  비디오 처리 완료 메시지를 받지 못했습니다 (계속 진행)');
    }

    await delay(1000);

    // 비디오 처리 완료 대기 (최대 120초)
    console.log('   ⏳ 비디오 처리 대기 중... (최대 120초)');
    let processed = false;
    
    for (let i = 0; i < 120; i++) {
      await delay(1000);
      
      try {
        const result = await page.evaluate(() => {
          const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
          const successText = alerts.some(el => 
            el.textContent.includes('처리 완료') || 
            el.textContent.includes('completed') ||
            el.textContent.includes('완료')
          );
          return successText;
        });
        
        if (result) {
          processed = true;
          break;
        }
      } catch (err) {
        // 평가 중 오류 무시
      }
      
      if (i % 10 === 0 && i > 0) {
        console.log(`   ⏳ ${i}초 경과...`);
      }
    }

    if (!processed) {
      console.warn('   ⚠️  비디오 처리 완료 메시지를 받지 못했습니다. (처리 중일 수 있음)');
      // 계속 진행
    } else {
      console.log('   ✅ 비디오 처리 완료!');
    }

    // 수화 이름 입력 필드 찾기 및 입력
    console.log(`   ✍️  수화 이름 입력: "${signName}"`);
    try {
      await page.evaluate((name) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const nameInput = inputs.find(inp => 
          inp.type === 'text' && inp.placeholder && inp.placeholder.includes('수화')
        ) || inputs.find(inp => inp.type === 'text');
        
        if (nameInput) {
          nameInput.value = '';
          nameInput.focus();
          const event = new Event('input', { bubbles: true });
          nameInput.dispatchEvent(event);
          return true;
        }
        return false;
      }, signName);
      
      // 텍스트 입력
      await page.keyboard.type(signName, { delay: 50 });
      await delay(500);
    } catch (err) {
      console.warn('   ⚠️  이름 입력 중 오류:', err.message);
    }

    // "저장" 버튼 찾기 및 클릭
    console.log('   💾 저장 중...');
    let saveClicked = false;
    try {
      saveClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(btn => 
          btn.textContent.includes('저장') && 
          !btn.textContent.includes('삭제') &&
          !btn.textContent.includes('취소')
        );
        
        if (saveBtn) {
          saveBtn.click();
          return true;
        }
        return false;
      });
    } catch (err) {
      console.warn('   ⚠️  저장 버튼 클릭 실패:', err.message);
    }

    if (!saveClicked) {
      console.error('   ❌ 저장 버튼을 찾을 수 없습니다.');
      return false;
    }

    await delay(2000);

    // 저장 완료 확인 (최대 10초)
    console.log('   ⏳ 저장 확인 중...');
    let saved = false;
    for (let i = 0; i < 10; i++) {
      try {
        const result = await page.evaluate(() => {
          const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
          return alerts.some(el => 
            el.textContent.includes('저장') ||
            el.textContent.includes('성공') ||
            el.textContent.includes('완료')
          );
        });
        
        if (result) {
          saved = true;
          break;
        }
      } catch (err) {
        // 무시
      }
      await delay(500);
    }

    if (saved) {
      console.log(`   ✅ "${signName}" 저장 완료!\n`);
    } else {
      console.log(`   ✓ "${signName}" 저장 버튼 클릭 완료\n`);
    }

    return true;

  } catch (error) {
    console.error(`   ❌ 오류 발생:`, error.message);
    return false;
  } finally {
    try {
      await page.close();
    } catch (err) {
      // 페이지 닫기 실패 무시
    }
  }
}

/**
 * 메인 함수
 */
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🚀 배치 자동 수화 학습 시작');
  console.log('═══════════════════════════════════════════════════\n');

  // 모든 영상 파일 ID 수집
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
    } else {
      console.warn(`⚠️  시작 ID ${startId}을(를) 찾을 수 없습니다.\n`);
    }
  }

  // 최대 개수 제한
  if (fileIds.length > maxCount) {
    fileIds = fileIds.slice(0, maxCount);
    console.log(`📍 처리 개수 제한: ${maxCount}개\n`);
  }

  // JSON 파일이 있는지 미리 확인
  const validIds = fileIds.filter(id => {
    const signName = getSignNameFromJson(id);
    const hasVideo = videoExists(id);
    
    if (!signName) {
      console.log(`⏭️  스킵: ${id} (JSON 메타데이터 없음)`);
      return false;
    }
    if (!hasVideo) {
      console.log(`⏭️  스킵: ${id} (영상 파일 없음)`);
      return false;
    }
    
    return true;
  });

  console.log(`\n📊 처리할 파일: ${validIds.length}개\n`);

  if (validIds.length === 0) {
    console.error('❌ 처리할 수 있는 파일이 없습니다.');
    process.exit(1);
  }

  // 브라우저 실행
  console.log('🌐 브라우저 시작...\n');
  
  // macOS Google Chrome 경로들
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ];
  
  let executablePath = undefined; // Puppeteer 기본값 사용
  
  // 시스템에 설치된 Chrome 찾기
  for (const path of chromePaths) {
    const { existsSync } = await import('fs');
    if (existsSync(path)) {
      executablePath = path;
      console.log(`✅ Chrome 찾음: ${path}\n`);
      break;
    }
  }
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1400, height: 900 },
      executablePath: executablePath,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check'
      ]
    });

    let successCount = 0;
    let failureCount = 0;
    const failedIds = [];

  try {
    for (let i = 0; i < validIds.length; i++) {
      const fileId = validIds[i];
      const signName = getSignNameFromJson(fileId);
      const pageNum = i + 1;
      const totalCount = validIds.length;

      const success = await learnSignWithPuppeteer(
        browser,
        fileId,
        signName,
        pageNum,
        totalCount
      );

      if (success) {
        successCount++;
      } else {
        failureCount++;
        failedIds.push(fileId);
      }

      // 각 배치 후 대기 (서버 부하 감소)
      if (i < validIds.length - 1) {
        const waitTime = 2000;
        console.log(`⏳ 다음 파일 처리를 위해 ${waitTime / 1000}초 대기...\n`);
        await delay(waitTime);
      }
    }
  } finally {
    // 브라우저 종료
    console.log('\n🛑 브라우저 종료 중...');
    await browser.close();
    }
  } catch (err) {
    console.error('❌ 브라우저 실행 실패:', err.message);
    console.error('\n💡 해결책:');
    console.error('1. npm install puppeteer --save-dev');
    console.error('2. Google Chrome이 설치되어 있는지 확인');
    console.error('3. 개발 서버가 실행 중인지 확인: npm run dev');
    process.exit(1);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (err) {
        // 무시
      }
    }
  }

  // 최종 결과 출력 (try 블록 내부로 이동)
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📊 처리 완료 요약');
  console.log('═══════════════════════════════════════════════════');
  console.log(`✅ 성공: ${successCount}개`);
  console.log(`❌ 실패: ${failureCount}개`);
  
  if (failedIds.length > 0) {
    console.log(`\n실패한 파일 ID:`);
    failedIds.forEach(id => console.log(`  - ${id}`));
    console.log(`\n재시도 커맨드:`);
    console.log(`  npm run batch-learn -- --start ${failedIds[0]}`);
  }

  console.log('\n✨ 배치 처리 완료!\n');
}

// 에러 처리
process.on('unhandledRejection', err => {
  console.error('\n❌ 예상치 못한 오류:', err);
  process.exit(1);
});

// 실행
main();
