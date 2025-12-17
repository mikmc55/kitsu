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

    //
    media = req.params.type;
    let id = req.params.id;
    id = id.replace(".json", "");

    if (process.env.CACHE != 0) {
      try {
        let stream_cached = await redis.json.get(config.id + "|" + id);
        if (!!stream_cached) {
          console.log(
            `Returning results from cache: ${stream_cached?.length} found`
          );
          await redis.disconnect();
          return res.send({ streams: stream_cached });
        }
      } catch (error) {
        console.log(`Failed to get ${id} from cache`);
      }
    }

    let tmp = [];

    if (id.includes("kitsu")) {
      tmp = await UTILS.getImdbFromKitsu(id);
      if (!tmp) {
        return res.send({ stream: {} });
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

    // query = query.replace(/['<>:]/g, "");

    let { batchResult, result } = await search({
      fn: UTILS.fetchNyaa,
      query,
      media,
      s,
      e,
      abs,
      abs_season,
      abs_episode,
      meta,
    });

    if (altName && altName.length > 0) {
      let { batchResult: altBatchResult, result: altResult } = await search({
        fn: UTILS.fetchNyaa,
        query: altName,
        media,
        s,
        e,
        abs,
        abs_season,
        abs_episode,
        meta,
      });

      batchResult = [...batchResult, ...altBatchResult];
      result = [...result, ...altResult];
    }

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

    console.log({ matches: matches.map((el) => el["Title"]) });
    console.log({ batchResult: batchResult.map((el) => el["Title"]) });
    console.log({ properresult: result.map((el) => el["Title"]) });

    console.log({ result: result.length });

    matches = matches.sort((a, b) => {
      // return -(+a["Seeders"] - +b["Seeders"]) ?? 0;
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    batchResult = batchResult.sort((a, b) => {
      // return -(+a["Seeders"] - +b["Seeders"]) ?? 0;
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    result = [
      ...(matches.length > 20 ? matches.slice(0, 20) : matches),
      ...(batchResult.length > 20 ? batchResult.slice(0, 20) : batchResult),
      // ...(result.length > 20 ? result.slice(0, 20) : result),
      ...result,
    ];
    result = removeDuplicate(result, "Title");

    result = result.sort((a, b) => {
      // return -(+a["Seeders"] - +b["Seeders"]) ?? 0;
      return -(+a["Peers"] - +b["Peers"]) ?? 0;
    });

    console.log({ "Retenus for filtering": result.length });

    const MAX_RES = process.env.MAX_RES ?? 20;
    result = result?.length >= MAX_RES ? result.splice(0, MAX_RES) : result;

    // ----------------------------------------------------------------------------

    result = (result ?? []).filter(
      (torrent) => torrent["MagnetUri"] != "" && torrent["Peers"] >= 0
    );

    console.log({ "Result after removing low peers items": result.length });

    torrentParsed = await UTILS.queue(
      result.map(
        (torrent) => () =>
          UTILS.getParsedFromMagnetorTorrentFile(torrent, torrent["MagnetUri"])
      ),
      5
    );
    torrentParsed = torrentParsed.filter(
      (torrent) =>
        torrent && torrent?.parsedTor && torrent?.parsedTor?.files?.length > 0
    );

    console.log({ "Parsed torrents": torrentParsed.length });

    let stream_results = await Promise.all([
      // UTILS.toRDStream(torrentParsed, {
      //   media,
      //   s,
      //   e,
      //   abs,
      //   abs_season,
      //   abs_episode,
      // }),
      UTILS.toPMStream(torrentParsed, {
        media,
        s,
        e,
        abs,
        abs_season,
        abs_episode,
      }),
    ]);

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
              new Date(Date.now() + 1000 * 60 * 60 * 24 * 10) //10 days
            );
          }
          console.log({ cache_ok });
        } catch (error) {
          console.log("Failed to cache " + id.toString() + ": ", error);
        }
      }
    }

    console.log({ "Final results": stream_results.length });

    return res.send({ streams: stream_results });
  })
  .listen(process.env.PORT || 3000, () => {
    console.log("The server is working on " + process.env.PORT || 3000);
  });
