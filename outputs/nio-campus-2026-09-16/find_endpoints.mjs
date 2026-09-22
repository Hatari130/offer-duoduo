import fs from 'fs';

const scripts = [
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/6218.437b4a52.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/9096.6a50bdeb.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/1702.9db529ae.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/8825.1a2a6d3f.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/3231.d2ae429c.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/5115.4112056d.js',
  'https://lf-package-cn.feishucdn.com/obj/atsx-throne/hire-fe-prod/portal/saas-career/static/js/5615.cdc43769.js'
];

async function main() {
  for (const s of scripts) {
    const text = await fetch(s).then(r => r.text());
    const m = text.match(/['"`](\/[a-zA-Z0-9_\-\.\/]+(?:position|job|search|campus|portal)[a-zA-Z0-9_\-\.\/]*)['"`]/gi);
    if (m && m.length > 0) {
      console.log(s.split('/').pop(), 'matches:', [...new Set(m)].slice(0, 20));
    }
  }
}

main().catch(console.error);
