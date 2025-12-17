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

// Helper to extract infohash from magnet URI
function extractInfoHash(magnetUri) {
  if (!magnetUri) return null;
  const match = magnetUri.match(/btih:([a-f0-9]{40})/i);
  return match ? match[1].toLowerCase() : null;
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

    result = [
      ...(matches.length > 10 ? matches.slice(0, 10) : matches),
      ...(batchResult.length > 10 ? batchResult.slice(0, 10) : batchResult),
      ...result,
    ];
    result = removeDuplicate(result, "Title");

    result = result.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    console.log({ "Retenus for filtering": result.length });

    // OPTIMIZATION: Reduced from 20 to 8
    const MAX_RES = process.env.MAX_RES ?? 8;
    result = result?.length >= MAX_RES ? result.slice(0, MAX_RES) : result;

    // Filter out torrents with no magnet or peers
    result = (result ?? []).filter(
      (torrent) => torrent["MagnetUri"] != "" && torrent["Peers"] >= 0
    );

    console.log({ "Result after filtering": result.length });

    // ============ OPTIMIZED: Skip torrent parsing, use magnets directly ============
    let stream_results = result
      .map((torrent) => {
        let infoHash = torrent["InfoHash"] || extractInfoHash(torrent["MagnetUri"]);
        
        if (!infoHash) {
          console.log("Skipping torrent without infohash:", torrent["Title"]);
          return null;
        }

        // Extract quality from title
        let quality = "";
        let title_lower = torrent["Title"].toLowerCase();
        if (title_lower.includes("2160p") || title_lower.includes("4k")) {
          quality = " 4K";
        } else if (title_lower.includes("1080p")) {
          quality = " 1080p";
        } else if (title_lower.includes("720p")) {
          quality = " 720p";
        } else if (title_lower.includes("480p")) {
          quality = " 480p";
        }

        // Create readable title
        let displayTitle = `${torrent["Title"]}\n💾 ${torrent["Size"] || "Unknown size"} | 🌱 ${torrent["Seeders"]}S ${torrent["Peers"]}P`;

        return {
          name: `Nyaa${quality}`,
          title: displayTitle,
          infoHash: infoHash,
          sources: [`tracker:${torrent["MagnetUri"]}`, `dht:${infoHash}`],
          behaviorHints: {
            bingeGroup: `nyaa|${infoHash}`,
            notWebReady: true,
          },
        };
      })
      .filter((s) => s !== null);
    // ============ END OPTIMIZATION ============

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
