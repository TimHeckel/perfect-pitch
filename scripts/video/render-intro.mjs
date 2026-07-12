import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptDir, '..', '..');
const outputDir = join(root, 'static', 'video');
const tempDir = join(root, '.tmp-intro-video');
const output = join(outputDir, 'pitch-trail-intro.mp4');
const poster = join(outputDir, 'pitch-trail-intro-poster.png');

mkdirSync(outputDir, { recursive: true });
rmSync(tempDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tempDir, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const video = page.video();
await page.goto(pathToFileURL(join(scriptDir, 'pitch-trail-intro.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.startIntro());
await page.waitForTimeout(26_250);
await page.close();
await context.close();
await browser.close();

const rawVideo = await video.path();
const piano = join(root, 'static', 'chords', 'piano', 'cfa_yellow_short.mp3');
const guitar = join(root, 'static', 'chords', 'guitar', 'c4f4a4_yellow.mp3');

execFileSync('ffmpeg', [
  '-y',
  '-i', rawVideo,
  '-i', piano,
  '-i', guitar,
  '-filter_complex',
  '[1:a]atrim=0:2.2,volume=0.7,afade=t=out:st=1.65:d=0.45,adelay=4300:all=1[piano];' +
  '[2:a]atrim=0:2.3,volume=0.62,afade=t=out:st=1.7:d=0.5,adelay=17100:all=1[guitar];' +
  'anullsrc=r=48000:cl=stereo,atrim=0:26[silence];' +
  '[silence][piano][guitar]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.92[audio]',
  '-map', '0:v:0',
  '-map', '[audio]',
  '-t', '26',
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-c:a', 'aac',
  '-b:a', '160k',
  '-movflags', '+faststart',
  output,
], { stdio: 'inherit' });

execFileSync('ffmpeg', [
  '-y',
  '-ss', '17.4',
  '-i', output,
  '-frames:v', '1',
  '-vf', 'scale=960:-2',
  '-c:v', 'png',
  '-compression_level', '8',
  poster,
], { stdio: 'inherit' });

rmSync(tempDir, { recursive: true, force: true });
