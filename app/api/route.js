export const revalidate = 300;

const FEED = 'https://it.motorsport.com/rss/motogp/news/';

function decode(s = '') {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tag(block, name) {
  const match = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')
  );

  return match ? match[1].trim() : '';
}

function cleanHtml(s = '') {
  return decode(s)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET() {
  try {
    const res = await fetch(FEED, {
      headers: {
        'User-Agent': 'Mozilla/5.0 FantaMotoGP/2026',
        Accept: 'application/rss+xml, application/xml, text/xml'
      },
      next: {
        revalidate: 300
      }
    });

    if (!res.ok) {
      throw new Error(`RSS ${res.status}`);
    }

    const xml = await res.text();

    const items = [
      ...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)
    ]
      .slice(0, 20)
      .map(match => {
        const block = match[0];

        return {
          title: decode(tag(block, 'title')),
          link: decode(tag(block, 'link')),
          pubDate: decode(tag(block, 'pubDate')),
          summary: cleanHtml(tag(block, 'description'))
        };
      })
      .filter(item => item.title && item.link);

    return Response.json(
      {
        items,
        updatedAt: new Date().toISOString()
      },
      {
        headers: {
          'Cache-Control':
            'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
  } catch (error) {
    console.error('RSS error:', error);

    return Response.json(
      {
        error: 'Feed non disponibile',
        items: []
      },
      {
        status: 502
      }
    );
  } 
}