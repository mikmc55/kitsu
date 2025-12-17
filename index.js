require("dotenv").config();
const express = require("express");
const app = express();
const {
  removeDuplicate,
  REGEX,
  getRanges,
  getAvatarName,
  isLatinValid,
  cleanKitsuName,
} = require("./helper");
const UTILS = require("./utils");
const redisClient = require("./redis");
const config = require("./config");
const { search } = require("./search_handler");

const redis = redisClient();

// Helper to detect if torrent is a batch/pack from title
function isBatchPack(title) {
  const batchIndicators = [
    /batch/i,
    /\d+-\d+/,  // e.g., "01-12"
    /complete/i,
    /season/i,
    /\bS\d+\b/i,  // e.g., "S01"
    /vol\s*\d+/i,
  ];
  return batchIndicators.some(pattern => pattern.test(title));
}

// ----------------------------------------------
app
  .get("/", (req, res) => {
    return res.status(200).send("okok");
  })
  .get("/manifest.json", (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    return res.send({ ...config });
  })
  .get("/stream/:type/:id", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    const startTime = Date.now();

    if (process.env.CACHE == 0) {
      console.log("[*] CACHE DISABLED");
    }

    // Connect to Redis only if cache enabled
    if (process.env.CACHE != 0) {
      try {
        await redis.connect();
        let ping = await redis.ping();
        console.log({ ping });
      } catch (error) {
        console.log("Redis connection failed, continuing without cache");
      }
    }

    media = req.params.type;
    let id = req.params.id;
    id = id.replace(".json", "");

    // Check cache first
    if (process.env.CACHE != 0) {
      try {
        let stream_cached = await redis.json.get(config.id + "|" + id);
        if (!!stream_cached) {
          console.log(`Cache hit: ${stream_cached?.length} results in ${Date.now() - startTime}ms`);
          await redis.disconnect();
          return res.send({ streams: stream_cached });
        }
      } catch (error) {
        console.log(`Cache miss for ${id}`);
      }
    }

    let tmp = [];

    if (id.includes("kitsu")) {
      tmp = await UTILS.getImdbFromKitsu(id);
      if (!tmp) {
        return res.send({ streams: [] });
      }
    } else {
      tmp = id.split(":");
    }

    let [tt, s, e, abs_season, abs_episode, abs, aliases] = tmp;

    console.log(tmp);

    let meta = await UTILS.getMeta(tt, media);

    console.log({ meta: id });
    console.log({ name: meta?.name, year: meta?.year });

    aliases = (aliases || []).map((e) => cleanKitsuName(e));
    const avatarName = getAvatarName(meta?.name);

    aliases = aliases.filter(
      (e) => isLatinValid(e) && e != meta.name && e != avatarName
    );
    let altName = aliases && aliases.length > 0 ? aliases[0] : null;

    console.log({ altName });

    let query = "";
    query = meta?.name ?? "";

    // OPTIMIZATION: Parallel searches instead of sequential
    let [mainSearchResult, altSearchResult] = await Promise.all([
      search({
        fn: UTILS.fetchNyaa,
        query,
        media,
        s,
        e,
        abs,
        abs_season,
        abs_episode,
        meta,
      }),
      altName && altName.length > 0
        ? search({
            fn: UTILS.fetchNyaa,
            query: altName,
            media,
            s,
            e,
            abs,
            abs_season,
            abs_episode,
            meta,
          })
        : { batchResult: [], result: [] },
    ]);

    let batchResult = [...mainSearchResult.batchResult, ...altSearchResult.batchResult];
    let result = [...mainSearchResult.result, ...altSearchResult.result];

    result = removeDuplicate(result, "Title");
    batchResult = removeDuplicate(batchResult, "Title");

    // ----------------------- FOR RANGE THINGS --------------------------

    let matches = [];
    let checked = [];

    console.log({ before_looking_ranges: batchResult.length });

    for (const key in batchResult) {
      try {
        const element = batchResult[key];

        if (!(element && "Title" in element)) continue;

        let ranges = getRanges(element["Title"], meta.year);

        if (!ranges) continue;
        if (!(ranges.episodes || ranges.seasons)) continue;

        checked = [...checked, element];

        if (ranges?.seasons && ranges.seasons?.start) {
          if (+ranges.seasons.start > +s) continue;

          if (ranges.seasons.end && +ranges.seasons.end >= +s) {
            matches = [...matches, element];
            continue;
          } else if (!ranges.seasons.end && +ranges.seasons.start == +s) {
            matches = [...matches, element];
            continue;
          } else {
            continue;
          }
        }

        if (ranges?.episodes && ranges.episodes?.start) {
          if (+ranges.episodes.start > +abs_episode) continue;
          if (ranges.episodes.end && +ranges.episodes.end >= +abs_episode) {
            matches = [...matches, element];
            continue;
          } else if (
            !ranges.episodes.end &&
            +ranges.episodes.start == +abs_episode
          ) {
            matches = [...matches, element];
            continue;
          }
        }
        continue;
      } catch (error) {
        continue;
      }
    }

    batchResult = batchResult.filter(
      (el) => !checked.includes(el) && !matches.includes(el)
    );

    console.log({ after_looking_ranges: batchResult.length });
    console.log({ matches: matches.length });
    console.log({ batchResult: batchResult.length });
    console.log({ properresult: result.length });

    // Sort by peers
    matches = matches.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    batchResult = batchResult.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    // OPTIMIZATION: Prioritize single episodes over packs
    let singleEpisodes = result.filter(t => !isBatchPack(t["Title"]));
    let packs = result.filter(t => isBatchPack(t["Title"]));
    
    console.log({ singleEpisodes: singleEpisodes.length, packs: packs.length });

    result = [
      ...(matches.length > 8 ? matches.slice(0, 8) : matches),
      ...(singleEpisodes.length > 5 ? singleEpisodes.slice(0, 5) : singleEpisodes),
      ...(batchResult.length > 8 ? batchResult.slice(0, 8) : batchResult),
      ...(packs.length > 3 ? packs.slice(0, 3) : packs), // Only include 3 packs as fallback
    ];
    result = removeDuplicate(result, "Title");

    result = result.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    console.log({ "Retenus for filtering": result.length });

    // OPTIMIZATION: Reduced from 20 to 10
    const MAX_RES = process.env.MAX_RES ?? 10;
    result = result?.length >= MAX_RES ? result.slice(0, MAX_RES) : result;

    // Filter out torrents with no magnet or peers
    result = (result ?? []).filter(
      (torrent) => torrent["MagnetUri"] != "" && torrent["Peers"] >= 0
    );

    console.log({ "Result after filtering": result.length });

    // OPTIMIZATION: Parse torrents in parallel with higher concurrency
    torrentParsed = await UTILS.queue(
      result.map(
        (torrent) => () =>
          UTILS.getParsedFromMagnetorTorrentFile(torrent, torrent["MagnetUri"])
      ),
      10 // Increased from 5 to 10 for parallel processing
    );
    
    torrentParsed = torrentParsed.filter(
      (torrent) =>
        torrent && torrent?.parsedTor && torrent?.parsedTor?.files?.length > 0
    );

    console.log({ "Parsed torrents": torrentParsed.length });

    // ============ Generate streams with proper file selection ============
    let stream_results = torrentParsed
      .map((tor) => {
        let parsed = tor.parsedTor;
        let infoHash = parsed.infoHash.toLowerCase();

        // Find video file that matches the episode/season
        let index = parsed.files.findIndex((file) => {
          let name = file.name?.toLowerCase() || "";
          return (
            UTILS.isVideo(file) &&
            UTILS.getFittedFile(name, s, e, abs, abs_season, abs_episode)
          );
        });

        // Skip if no matching video file found
        if (index === -1) {
          console.log(`No matching file in: ${tor.Title}`);
          return null;
        }

        let file = parsed.files[index];

        // Create title with torrent name, file name, size, and peer info
        let title = `${tor.Title}\n${file.name}\n${UTILS.getSize(file.length)} | 🌱 ${tor.Seeders}S ${tor.Peers}P`;

        // Return Stremio-compatible stream object
        return {
          name: `Nyaa${UTILS.getQuality(file.name)}`,
          title: title,
          infoHash: infoHash,
          fileIdx: index,
          sources: (parsed.announce || [])
            .map((x) => `tracker:${x}`)
            .concat([`dht:${infoHash}`]),
          behaviorHints: {
            bingeGroup: `nyaa|${infoHash}`,
            notWebReady: true,
          },
        };
      })
      .filter((s) => s !== null);
    // ============ END ============

    stream_results = stream_results.flat();
    stream_results = Array.from(new Set(stream_results)).filter((e) => !!e);

    // Quality-based sorting
    stream_results = [
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities["4k"]),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.fhd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.hd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.sd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.unknown),
    ];

    // Cache results
    if (process.env.CACHE != 0) {
      if (stream_results.length != 0) {
        try {
          let cache_ok = await redis.json.set(
            `${config.id}|${id}`,
            "$",
            stream_results
          );
          if (cache_ok) {
            await redis.expireAt(
              `${config.id}|${id}`,
              new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) // 7 days cache
            );
          }
          console.log({ cache_ok });
        } catch (error) {
          console.log("Failed to cache " + id.toString() + ": ", error);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    console.log({ "Final results": stream_results.length, "Total time": `${totalTime}ms` });

    // Disconnect Redis
    if (process.env.CACHE != 0) {
      try {
        await redis.disconnect();
      } catch (error) {}
    }

    return res.send({ streams: stream_results });
  })
  .listen(process.env.PORT || 3003, () => {
    console.log("The server is working on " + process.env.PORT || 3003);
  });
