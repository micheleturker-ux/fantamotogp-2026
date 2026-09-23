export const revalidate = 300;

const FEED = 'https://it.motorsport.com/rss/motogp/news/';

function decode(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decode(m[1].trim()) : '';
}

function cleanHtml(s = '') {
  return decode(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  try {
    const res = await fetch(FEED, {
      next: { revalidate: 300 },
      headers: { 'User-Agent': 'FantaMotoGP/1.0' }
    });

    if (!res.ok) {
      throw new Error(`RSS ${res.status}`);
    }

    const xml = await res.text();
    const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);

    const items = blocks
      .slice(0, 24)
      .map((b) => ({
        title: cleanHtml(tag(b, 'title')),
        link: tag(b, 'link'),
        pubDate: tag(b, 'pubDate'),
        summary: cleanHtml(tag(b, 'description')).slice(0, 260)
      }))
      .filter((x) => x.title && x.link);

    return Response.json(
      { items, updatedAt: new Date().toISOString() },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
  } catch (e) {
    return Response.json(
      { error: e?.message || 'Feed non disponibile', items: [] },
      { status: 502 }
    );
  }
}
