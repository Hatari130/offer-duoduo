import fs from 'fs';
import path from 'path';

const OUT_DIR = 'outputs/nio-campus-2026-09-16';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const url = 'https://nio.jobs.feishu.cn/campus/?current=1&limit=10';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  const html = await res.text();
  console.log('Status:', res.status, 'HTML length:', html.length);
  fs.writeFileSync(path.join(OUT_DIR, 'page.html'), html, 'utf8');

  // Check script tags
  const scripts = [];
  const scriptRegex = /<script[^>]*src=["']([^"']+)["']/g;
  let m;
  while ((m = scriptRegex.exec(html)) !== null) {
    scripts.push(m[1]);
  }
  console.log('Scripts:', scripts);

  // Check inline script data
  const inlineRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let inline;
  while ((inline = inlineRegex.exec(html)) !== null) {
    const content = inline[1];
    if (content.includes('window.') || content.includes('__INITIAL')) {
      console.log('Inline script snippet:', content.slice(0, 300));
    }
  }
}

main().catch(console.error);
