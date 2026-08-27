import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(scriptDirectory, "..");
const sourceRoot = resolve(extensionRoot, "store-assets/source");
const storeRoot = resolve(extensionRoot, "store-assets");
const iconRoot = resolve(extensionRoot, "public/icons");

await Promise.all([mkdir(storeRoot, { recursive: true }), mkdir(iconRoot, { recursive: true })]);

const iconSvg = await readFile(resolve(sourceRoot, "jobkoi-icon.svg"));
for (const size of [16, 32, 48, 128]) {
  await sharp(iconSvg, { density: 384 })
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(iconRoot, `icon-${size}.png`));
}

await sharp(iconSvg, { density: 384 })
  .resize(128, 128, { kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9, adaptiveFiltering: true })
  .toFile(resolve(storeRoot, "store-icon-128.png"));

for (const [source, output, width, height] of [
  ["small-promo.svg", "small-promo-440x280.png", 440, 280],
  ["marquee.svg", "marquee-1400x560.png", 1400, 560]
]) {
  const svg = await readFile(resolve(sourceRoot, source));
  await sharp(svg, { density: 144 })
    .resize(width, height)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(storeRoot, output));
}

async function generateStoreScreenshot({ rawFile, outputFile, title, subtitle }) {
  const rawScreenshot = resolve(storeRoot, `screenshots/${rawFile}`);
  await access(rawScreenshot);
  const screenshot = await sharp(rawScreenshot)
    .resize(1280, 673, { fit: "fill" })
    .png()
    .toBuffer();
  const header = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="127" viewBox="0 0 1280 127">
      <rect width="1280" height="127" fill="#121310"/>
      <g transform="translate(40 27) scale(.55)">
        <rect x="16" y="16" width="96" height="96" rx="28" fill="#4564E9"/>
        <g transform="translate(24 24) scale(2.5)" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9.25 23.25a10.5 10.5 0 1 1 14.5-3.15" stroke-width="2.35"/>
          <path d="m20.55 19.05 3.3 1.15.5-3.45" stroke-width="2.5"/>
        </g>
        <circle cx="47.125" cy="82.125" r="5.875" fill="#FFFFFF"/>
        <circle cx="47.125" cy="82.125" r="1.875" fill="#3B59DA"/>
      </g>
      <text x="125" y="62" fill="#FFFFFF" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="28" font-weight="700">${title}</text>
      <text x="125" y="91" fill="#B8B9B3" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="16">${subtitle}</text>
      <rect x="1058" y="42" width="176" height="43" rx="21.5" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".14"/>
      <circle cx="1083" cy="63.5" r="5" fill="#58D39E"/>
      <text x="1098" y="70" fill="#FFFFFF" font-family="Microsoft YaHei, Noto Sans CJK SC, sans-serif" font-size="16" font-weight="700">真实插件界面</text>
    </svg>
  `);
  await sharp({
    create: { width: 1280, height: 800, channels: 4, background: "#121310" }
  })
    .composite([
      { input: header, left: 0, top: 0 },
      { input: screenshot, left: 0, top: 127 }
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(resolve(storeRoot, outputFile));
}

for (const screenshot of [
  {
    rawFile: "dashboard-seeded-raw.png",
    outputFile: "screenshot-1-1280x800.png",
    title: "把每一次投递，放回同一张看板",
    subtitle: "岗位识别、投递阶段和下一步行动，在插件里持续更新"
  },
  {
    rawFile: "overlay-raw.png",
    outputFile: "screenshot-2-1280x800.png",
    title: "不离开招聘页面，也能看清投递进度",
    subtitle: "识别当前页面后，岗位和流程变化会回到同账号工作台"
  }
]) {
  try {
    await generateStoreScreenshot(screenshot);
  } catch {
    console.warn(`Skipped ${screenshot.outputFile} because screenshots/${screenshot.rawFile} is missing.`);
  }
}

console.log("Generated Chrome Web Store icons and promotional images.");
