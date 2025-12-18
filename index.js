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
  const match = magnetUri.match(/btih:([a-fA-F0-9]{40})/i);
  return match ? match[1].toUpperCase() : null;
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

    if (process.env.CACHE != 0) {
      try {
        await redis.connect();
        let ping = await redis.ping();
        console.log({ ping });
      } catch (error) {}
    }

    media = req.params.type;
    let id = req.params.id;
    id = id.replace(".json", "");

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

    matches = matches.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    batchResult = batchResult.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    result = [
      ...(matches.length > 20 ? matches.slice(0, 20) : matches),
      ...(batchResult.length > 20 ? batchResult.slice(0, 20) : batchResult),
      ...result,
    ];
    result = removeDuplicate(result, "Title");

    result = result.sort((a, b) => {
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    console.log({ "Retenus for filtering": result.length });

    // OPTIMIZATION: Reduced max results for faster processing
    const MAX_RES = process.env.MAX_RES ?? 15;
    result = result?.length >= MAX_RES ? result.slice(0, MAX_RES) : result;

    result = (result ?? []).filter(
      (torrent) => torrent["MagnetUri"] != "" && torrent["Peers"] >= 0
    );

    console.log({ "Result after removing low peers items": result.length });

    // ============ PM INTEGRATION - NO PARSING NEEDED ============
    const { PM } = require("./pm");
    
    console.log("\n🔍 Checking Premiumize cache (no parsing required)...");
    
    let stream_results = [];
    
    for (const torrent of result) {
      try {
        // Extract infohash from magnet (no parsing needed!)
        const infoHash = torrent["InfoHash"] || extractInfoHash(torrent["MagnetUri"]);
        if (!infoHash) continue;

        // Check PM cache
        const cachedFilename = await PM.checkCached(infoHash);
        
        if (!cachedFilename) {
          console.log(`⏭️  Not cached: ${torrent["Title"].substring(0, 40)}...`);
          continue;
        }

        console.log(`✅ Cached: ${cachedFilename}`);

        // Get file list from PM (instant, no local parsing!)
        const fileList = await PM.getDirectDl(infoHash);
        
        if (!fileList || !fileList.length) {
          console.log(`⚠️  No files for: ${cachedFilename}`);
          continue;
        }

        console.log(`📂 Got ${fileList.length} files`);

        // Smart file selection
        let selectedFile = null;
        
        if (media === "movie") {
          // Find largest video file for movies
          const videoFiles = fileList.filter(f => {
            const path = f.path || f.name || "";
            return /\.(mkv|mp4|avi|mov|wmv|m4v|webm)$/i.test(path);
          });
          
          if (videoFiles.length > 0) {
            selectedFile = videoFiles.reduce((max, f) => f.size > max.size ? f : max);
          }
        } else {
          // Find episode in pack for series
          const videoFiles = fileList.filter(f => {
            const path = f.path || f.name || "";
            return /\.(mkv|mp4|avi|mov|wmv|m4v|webm)$/i.test(path);
          });

          for (const file of videoFiles) {
            const fileName = (file.path || file.name || "").toLowerCase();
            
            // Check episode patterns
            const patterns = [
              new RegExp(`s${s?.padStart(2, "0")}e${e?.padStart(2, "0")}`, 'i'),
              new RegExp(`s${s}e${e?.padStart(2, "0")}`, 'i'),
              new RegExp(`${s}x${e?.padStart(2, "0")}`, 'i'),
            ];
            
            if (abs_episode) {
              patterns.push(new RegExp(`e${abs_episode?.padStart(2, "0")}`, 'i'));
            }

            if (patterns.some(p => p.test(fileName))) {
              selectedFile = file;
              break;
            }
          }

          // Fallback to largest if no match
          if (!selectedFile && videoFiles.length > 0) {
            selectedFile = videoFiles.reduce((max, f) => f.size > max.size ? f : max);
          }
        }

        if (!selectedFile) {
          console.log(`⚠️  No suitable file found`);
          continue;
        }

        // Build stream
        const fileName = (selectedFile.path || selectedFile.name || "").split('/').pop();
        const fileSize = selectedFile.size 
          ? `${(selectedFile.size / (1024 ** 3)).toFixed(2)} GB`
          : torrent["Size"] || "Unknown";

        let quality = "";
        if (/2160p|4k/i.test(fileName)) quality = " 4K";
        else if (/1080p/i.test(fileName)) quality = " 1080p";
        else if (/720p/i.test(fileName)) quality = " 720p";
        else if (/480p/i.test(fileName)) quality = " 480p";

        const streamTitle = [
          torrent["Title"],
          `📁 ${fileName}`,
          `💾 ${fileSize} | 🌱 ${torrent["Seeders"]}S ${torrent["Peers"]}P`,
          `⚡ Premiumize - Instant Playback`
        ].join('\n');

        stream_results.push({
          name: `[⚡PM⚡] Nyaa${quality}`,
          title: streamTitle,
          url: selectedFile.link || selectedFile.stream_link,
          behaviorHints: {
            bingeGroup: `nyaa-pm|${infoHash}`,
            filename: fileName
          }
        });

        console.log(`✅ Added: ${quality} ${fileSize}`);

      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        continue;
      }
    }

    console.log(`\n📊 PM Results: ${stream_results.length} streams`);
    // ============ END PM INTEGRATION ============

    stream_results = stream_results.flat();

    stream_results = Array.from(new Set(stream_results)).filter((e) => !!e);

    stream_results = [
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities["4k"]),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.fhd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.hd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.sd),
      ...UTILS.filterBasedOnQuality(stream_results, UTILS.qualities.unknown),
    ];

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
              new Date(Date.now() + 1000 * 60 * 60 * 24 * 10)
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
