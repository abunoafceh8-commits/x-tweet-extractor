const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username } = body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  
  const cleanUser = username.replace('@', '').trim();
  const tweetLinks = [];

  try {
    // Method 1: Wayback CDX for twitter.com
    const sources = [
      `twitter.com/${cleanUser}/status/*`,
      `x.com/${cleanUser}/status/*`
    ];
    
    for (const src of sources) {
      try {
        const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${src}&output=json&limit=300&fl=timestamp,original,statuscode&collapse=urlkey`, {
          signal: AbortSignal.timeout(15000)
        });
        const data = await r.json();
        const [, ...rows] = data;
        rows.forEach(row => {
          if (row[2] === '200') {
            const tweetId = row[1].match(/\/status\/(\d+)/)?.[1];
            if (tweetId && !tweetLinks.find(t => t.id === tweetId)) {
              tweetLinks.push({
                id: tweetId,
                url: row[1],
                archiveUrl: `https://web.archive.org/web/${row[0]}/${row[1]}`,
                date: `${row[0].slice(0,4)}-${row[0].slice(4,6)}-${row[0].slice(6,8)}`,
                timestamp: row[0]
              });
            }
          }
        });
      } catch {}
    }

    // Method 2: Syndication
    try {
      const r = await fetch(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${cleanUser}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(10000)
      });
      const html = await r.text();
      const ids = html.match(/data-tweet-id="(\d+)"/g);
      if (ids) {
        ids.forEach(m => {
          const id = m.match(/(\d+)/)[1];
          if (!tweetLinks.find(t => t.id === id)) {
            tweetLinks.push({
              id,
              url: `https://x.com/${cleanUser}/status/${id}`,
              date: null,
              live: true
            });
          }
        });
      }
    } catch {}

    tweetLinks.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ username: cleanUser, tweets: tweetLinks, total: tweetLinks.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, tweets: [], total: 0 });
  }
}
