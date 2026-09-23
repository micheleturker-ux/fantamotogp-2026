export const dynamic = "force-dynamic";

const FEED = "https://it.motorsport.com/rss/motogp/news/";

function decodeEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getTag(block, name) {
  const regex = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
    "i"
  );

  const match = block.match(regex);

  return match ? decodeEntities(match[1].trim()) : "";
}

function cleanText(text = "") {
  return decodeEntities(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET() {
  try {
    const response = await fetch(FEED, {
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json({
        error: `Feed RSS non disponibile (${response.status})`,
        items: [],
      });
    }

    const xml = await response.text();

    const blocks = Array.from(
      xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)
    ).map((match) => match[1]);

    const items = blocks
      .slice(0, 24)
      .map((block) => ({
        title: cleanText(getTag(block, "title")),
        link: getTag(block, "link"),
        pubDate: getTag(block, "pubDate"),
        summary: cleanText(getTag(block, "description")).slice(0, 260),
      }))
      .filter((item) => item.title && item.link);

    return Response.json({
      items,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Feed non disponibile",
      items: [],
    });
  }
}