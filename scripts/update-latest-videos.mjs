import { writeFile } from "node:fs/promises";

const channelUrl = "https://www.youtube.com/@DuelCommanderPiacenza";
const outputPath = new URL("../videos.json", import.meta.url);
const maxVideos = 6;

function decodeXml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url} with HTTP ${response.status}`);
  }

  return response.text();
}

function extractChannelId(html) {
  const patterns = [
    /"channelId":"(UC[^"]+)"/,
    /"externalId":"(UC[^"]+)"/,
    /https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("Could not determine YouTube channel id from the channel page.");
}

function parseFeedEntries(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];

  return entries.slice(0, maxVideos).map((match) => {
    const entry = match[1];
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? null;
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "Untitled video");
    const publishedAt =
      entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
    const thumbnailUrl =
      entry.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ??
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
    const link =
      entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ??
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);

    return {
      id: videoId,
      title,
      url: link,
      publishedAtUtc: publishedAt,
      thumbnailUrl,
    };
  }).filter((video) => video.id && video.url);
}

const channelPage = await fetchText(channelUrl);
const channelId = extractChannelId(channelPage);
const feedXml = await fetchText(
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
);
const videos = parseFeedEntries(feedXml);

await writeFile(outputPath, `${JSON.stringify(videos, null, 2)}\n`, "utf8");

console.log(`Saved ${videos.length} video(s) to videos.json`);
