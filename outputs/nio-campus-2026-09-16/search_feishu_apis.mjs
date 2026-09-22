import fs from 'fs';

async function main() {
  const url = 'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/pc.ee0f1383.js';
  const text = await fetch(url).then(r => r.text());
  console.log('pc.js length:', text.length);

  const re = /['"`](\/api\/[a-zA-Z0-9_\-\.\/]+)['"`]/g;
  const apis = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    apis.push(m[1]);
  }
  console.log('APIs in pc.js:', [...new Set(apis)]);
}

main().catch(console.error);
