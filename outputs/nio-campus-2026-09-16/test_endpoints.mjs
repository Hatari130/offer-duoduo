const endpoints = [
  '/api/v1/search/job/posts',
  '/api/v1/position/search',
  '/api/v1/search/job/filter',
  '/api/v1/search/job/query',
  '/api/v1/portal/position/search',
  '/api/v1/campus/position/search',
  '/api/v1/position/list',
  '/api/v1/job/posts',
  '/api/v1/jobs',
  '/api/v1/search/job/posts?keyword=&limit=10&offset=0',
  '/api/v1/position/search?keyword=&limit=10&offset=0'
];

async function main() {
  for (const ep of endpoints) {
    const url = 'https://nio.jobs.feishu.cn' + ep;
    try {
      const getRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://nio.jobs.feishu.cn/campus/'
        }
      });
      const postRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://nio.jobs.feishu.cn/campus/'
        },
        body: JSON.stringify({ keyword: '', limit: 10, offset: 0 })
      });
      console.log(ep, 'GET:', getRes.status, 'POST:', postRes.status);
      if (getRes.status === 200) {
        const text = await getRes.text();
        console.log('GET 200 body:', text.slice(0, 200));
      }
      if (postRes.status === 200) {
        const text = await postRes.text();
        console.log('POST 200 body:', text.slice(0, 200));
      }
    } catch (e) {
      console.log(ep, 'ERR:', e.message);
    }
  }
}

main().catch(console.error);
