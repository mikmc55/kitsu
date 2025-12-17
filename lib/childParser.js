const TorrentParser = require("./torrent");

process.on("message", async (message) => {
  if (message.url) {
    const parser = new TorrentParser();
    const parsed = await parser.parse(message?.url, {
      Cookie: message?.Cookie ?? "",
    });
    parser.destroy();
    process.send(parsed);
  }
});
