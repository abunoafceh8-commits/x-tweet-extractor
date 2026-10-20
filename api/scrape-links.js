const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, count = 40, cursor } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const cleanUser = username.replace('@', '').trim();
  const tweets = [];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Syndication for live tweets
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000)
      });
      const html = await r.text();
      const ids = [...html.matchAll(/data-tweet-id="(\d+)"/g)];
      ids.forEach(m => {
        tweets.push({
          id: m[1],
          tweet_id: m[1],
          url: `https://x.com/${cleanUser}/status/${m[1]}`,
          link: `https://x.com/${cleanUser}/status/${m[1]}`,
          status: 'live'
        });
      });
    } catch {}

    // Wayback CDX
    for (const domain of ['twitter.com', 'x.com']) {
      try {
        const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${domain}/${cleanUser}/status/*&output=json&limit=${count}&fl=timestamp,original,statuscode&collapse=urlkey&statuscode=200`, {
          signal: AbortSignal.timeout(8000)
        });
        const data = await r.json();
        const [, ...rows] = data;
        rows.forEach(row => {
          const tid = row[1]?.match(/\/status\/(\d+)/)?.[1];
          if (tid && !tweets.find(t => t.tweet_id === tid)) {
            tweets.push({
              id: tid, tweet_id: tid,
              url: row[1],
              link: row[1],
              archive_url: `https://web.archive.org/web/${row[0]}/${row[1]}`,
              date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
              status: 'archived'
            });
          }
        });
      } catch {}
    }

    return res.json({
      username: cleanUser,
      tweets: tweets.slice(0, count),
      links: tweets.slice(0, count).map(t => t.url || t.link),
      total: tweets.length,
      count: tweets.slice(0, count).length,
      cursor: cursor ? parseInt(cursor) + count : count,
      has_more: tweets.length > count
    });
  } catch (e) {
    return res.json({ error: e.message, tweets: [], links: [], total: 0 });
  }
}
