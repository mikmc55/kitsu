require("dotenv").config();
const parseTorrent = require("parse-torrent");
const fetch = require("node-fetch");
const { PM } = require("./pm");
const AllDebrid = require("./ad");
const DebridLink = require("./dl");
const { XMLParser } = require("fast-xml-parser");
const RealDebrid = require("./rd");
const { fork } = require("child_process");

let nbreAdded = 0;
let cookie = "";

let containEandS = (name = "", s, e, abs, abs_season, abs_episode) =>
  //SxxExx ./ /~/-
  //SxExx
  //SxExx
  //axb
  //Sxx - Exx
  //Sxx.Exx
  //Season xx Exx
  //SasEae selon abs
  //SasEaex  selon abs
  //SasEaexx  selon abs
  //SxxEaexx selon abs
  //SxxEaexxx  selon abs
  name?.includes(`s${s?.padStart(2, "0")}e${e?.padStart(2, "0")} `) ||
  name?.includes(`s${s?.padStart(2, "0")}e${e?.padStart(2, "0")}.`) ||
  name?.includes(`s${s?.padStart(2, "0")}e${e?.padStart(2, "0")}-`) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")} `) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")}.`) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")}-`) ||
  name?.includes(`${s}x${e}`) ||
  name?.includes(`s${s?.padStart(2, "0")} - e${e?.padStart(2, "0")}`) ||
  name?.includes(`s${s?.padStart(2, "0")}.e${e?.padStart(2, "0")}`) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")} `) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")}.`) ||
  name?.includes(`s${s}e${e?.padStart(2, "0")}-`) ||
  name?.includes(`s${s?.padStart(2, "0")}e${e} `) ||
  name?.includes(`s${s?.padStart(2, "0")}e${e}.`) ||
  name?.includes(`s${s?.padStart(2, "0")}e${e}-`) ||
  name?.includes(`season ${s} e${e}`) ||
  (!!abs &&
    (name?.includes(
      `s${abs_season?.padStart(2, "0")}e${abs_episode?.padStart(2, "0")}`
    ) ||
      name?.includes(
        `s${s?.padStart(2, "0")}e${abs_episode?.padStart(2, "0")}`
      ) ||
      name?.includes(
        `s${s?.padStart(2, "0")}e${abs_episode?.padStart(3, "0")}`
      ) ||
      name?.includes(
        `s${abs_season?.padStart(2, "0")}e${abs_episode?.padStart(3, "0")}`
      ) ||
      name?.includes(
        `s${abs_season?.padStart(2, "0")}e${abs_episode?.padStart(4, "0")}`
      )));

let containE_S = (name = "", s, e, abs, abs_season, abs_episode) =>
  //Sxx - xx
  //Sx - xx
  //Sx - x
  //Season x - x
  //Season x - xx
  name?.includes(`s${s?.padStart(2, "0")} - ${e?.padStart(2, "0")}`) ||
  name?.includes(`s${s} - ${e?.padStart(2, "0")}`) ||
  // name?.includes(`s${s} - ${e}`) ||
  // name?.includes(`season ${s} - ${e}`) ||
  name?.includes(`season ${s} - ${e?.padStart(2, "0")}`) ||
  name?.includes(`season ${s} - ${e?.padStart(2, "0")}`);

let containsAbsoluteE = (name = "", s, e, abs, abs_season, abs_episode) =>
  //- xx
  //- xxx
  //- xxxx
  //- 0x
  name?.includes(` ${abs_episode?.padStart(2, "0")} `) ||
  name?.includes(` ${abs_episode?.padStart(3, "0")} `) ||
  name?.includes(` 0${abs_episode} `) ||
  name?.includes(` ${abs_episode?.padStart(4, "0")} `);

let containsAbsoluteE_ = (name = "", s, e, abs, abs_season, abs_episode) =>
  // xx.
  // xxx.
  // xxxx.
  // 0x.
  name?.includes(` ${abs_episode?.padStart(2, "0")}.`) ||
  name?.includes(` ${abs_episode?.padStart(3, "0")}.`) ||
  name?.includes(` 0${abs_episode}.`) ||
  name?.includes(` ${abs_episode?.padStart(4, "0")}.`);

let fetchNyaaRssTorrent2 = async (query, type) => {
  // let url = `${host}/api/v2.0/indexers/all/results?apikey=${apiKey}&Query=${query}&Tracker%5B%5D=nyaasi`;

  query = decodeURIComponent(query).replace(/\s/g, "+");

  let url = `https://nyaa.si/?page=rss&q=${query}&c=1_0&f=0`;

  return await fetch(url, {
    method: "GET",
  })
    .then(async (res) => {
      try {
        const parser = new XMLParser();
        let jObj = parser.parse(await res.text());

        return "rss" in jObj &&
          "channel" in jObj["rss"] &&
          "item" in jObj["rss"]["channel"]
          ? jObj["rss"]["channel"]["item"]
          : [];
      } catch (error) {
        console.log({ error });
        return [];
      }
    })
    .then(async (results) => {
      if (!!results) {
        results = Array.isArray(results) ? results : [results];
        console.log({ Initial: results?.length });
        torrent_results = await Promise.all(
          results?.map((result) => {
            return new Promise((resolve, reject) => {
              resolve({
                Tracker: "Nyaa Rss",
                Peers: result["nyaa:leechers"],
                Seeders: result["nyaa:seeders"],
                Category: result["nyaa:category"],
                Title: result["title"],
                Link: result["link"],
                MagnetUri: result["link"],
                Date: result["pubDate"],
                Description: result["description"],
              });
            });
          })
        );
        return torrent_results;
      } else {
        return [];
      }
    })
    .catch((err) => {
      console.log({ err });
      return [];
    });
};

let hosts = [];

const raw_content = require("fs").readFileSync("./servers.txt");
let content = Buffer.isBuffer(raw_content)
  ? raw_content.toString()
  : raw_content;
hosts = content
  .split("\n")
  .map((el) => el.trim())
  .map((el) => {
    if (!el.includes("|")) return null;
    return {
      host: el.split("|")[0],
      apiKey: el.split("|").pop(),
    };
  });

hosts = hosts.filter((el) => !!el);

// const api = "http://localhost:3009/torrent";
const api = "https://nyaascrapper.vercel.app/torrent";

let fetchNyaa = async (query, type = "series", s = 0) => {
  query = decodeURIComponent(query);

  const controller = new AbortController();
  const TIMEOUT = +process.env.TIMEOUT ?? 15000;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  let headersList = {
    Accept: "*/*",
    "Content-Type": "application/json",
  };

  let payload = {
    searchTerm: query,
    season: s,
    isMovie: type == "movie",
  };

  console.log({ payload });

  let bodyContent = JSON.stringify(payload);

  try {
    return await fetch(api, {
      method: "POST",
      body: bodyContent,
      headers: headersList,
    })
      .then((res) => res.json())
      .then(async (results) => {
        console.log({ Initial: results["data"]?.length });
        if (results["data"].length != 0) {
          torrent_results = await Promise.all(
            results["data"].map((result) => {
              return new Promise((resolve, reject) => {
                resolve({
                  Tracker: "Nyaa",
                  id: result["id"],
                  Category: type,
                  Title: result["name"],
                  Size: result["size"],
                  Date: result["date"],
                  Seeders: result["seeders"],
                  Peers: result["leechers"],
                  Link: result["url"],
                  MagnetUri: result["magnet"],
                  Cookie: "cookie" in results ? results["cookie"] : "",
                });
              });
            })
          );
          clearTimeout(timeoutId);
          return torrent_results;
        } else {
          clearTimeout(timeoutId);
          return [];
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        return [];
      });
  } catch (error) {
    clearTimeout(timeoutId);
    return [];
  }
};

let fetchNyaaRssTorrent = async (query, type = "series") => {
  let hostdata = hosts[Math.floor(Math.random() * hosts.length)];
  if (!hostdata) return [];

  let url = `${hostdata.host}/api/v2.0/indexers/all/results?apikey=${hostdata.apiKey}&Query=${query}&Tracker%5B%5D=nyaasi&Category%5B%5D=2000&Category%5B%5D=5000`;

  const controller = new AbortController();
  const TIMEOUT = +process.env.TIMEOUT ?? 15000;
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    return await fetch(url, {
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.9",
        "x-requested-with": "XMLHttpRequest",
      },
      referrerPolicy: "no-referrer",
      method: "GET",
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then(async (results) => {
        console.log({ Initial: results["Results"]?.length });
        if (results["Results"].length != 0) {
          torrent_results = await Promise.all(
            results["Results"].map((result) => {
              return new Promise((resolve, reject) => {
                resolve({
                  Tracker: result["Tracker"],
                  Category: result["CategoryDesc"],
                  Title: result["Title"],
                  Seeders: result["Seeders"],
                  Peers: result["Peers"],
                  Link: result["Link"],
                  MagnetUri: result["MagnetUri"],
                });
              });
            })
          );
          clearTimeout(timeoutId);
          return torrent_results;
        } else {
          clearTimeout(timeoutId);
          return [];
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        return [];
      });
  } catch (error) {
    clearTimeout(timeoutId);
    return [];
  }
};

function getMeta(id, type) {
  var [tt, s, e] = id.split(":");

  return fetch(`https://v3-cinemeta.strem.io/meta/${type}/${tt}.json`)
    .then((res) => res.json())
    .then((json) => {
      return {
        name: json.meta["name"],
        year: json.meta["releaseInfo"]?.substring(0, 4) ?? 0,
      };
    })
    .catch((err) =>
      fetch(`https://v2.sg.media-imdb.com/suggestion/t/${tt}.json`)
        .then((res) => res.json())
        .then((json) => {
          return json.d[0];
        })
        .then(({ l, y }) => ({ name: l, year: y }))
    );
}

async function getImdbFromKitsu(id) {
  var [kitsu, _id, e] = id.split(":");

  return fetch(`https://anime-kitsu.strem.fun/meta/anime/${kitsu}:${_id}.json`)
    .then((_res) => _res.json())
    .then((json) => {
      return json["meta"];
    })
    .then((json) => {
      try {
        let imdb = json["imdb_id"];
        let meta = json["videos"].find((el) => el.id == id);
        return [
          imdb,
          (meta["imdbSeason"] ?? 1).toString(),
          (meta["imdbEpisode"] ?? 1).toString(),
          (meta["season"] ?? 1).toString(),
          (meta["imdbSeason"] ?? 1).toString() == 1
            ? (meta["imdbEpisode"] ?? 1).toString()
            : (meta["episode"] ?? 1).toString(),
          meta["imdbEpisode"] != meta["episode"] || meta["imdbSeason"] == 1,
          "aliases" in json ? json["aliases"] : [],
        ];
      } catch (error) {
        return null;
      }
    })
    .catch((err) => null);
}

const queue = async (queue = [], nbreConcurrent = 1) => {
  let result = [];
  let totalQ = [...queue].length;
  let run = Math.ceil([...queue].length / nbreConcurrent);

  for (let i = 0; i < run; i++) {
    const range = {
      start: i * nbreConcurrent,
      end:
        i * nbreConcurrent + nbreConcurrent > totalQ
          ? totalQ
          : i * nbreConcurrent + nbreConcurrent,
    };
    let sQueue =
      [...queue].length > nbreConcurrent
        ? [...queue].slice(range.start, range.end)
        : [...queue];

    console.log(
      `TQueue: ${totalQ} | Run: ${i + 1}/${run} | CQueue: ${
        sQueue.length
      } | from ${range.start} to ${range.end}`
    );
    const temp = await Promise.all(sQueue.map((el) => el()));
    result = [...result, ...(temp ? temp.flat() : [])];
  }

  console.log(`[*] To Return: ${result.length} | Total: ${totalQ}`);

  return result;
};

let isRedirect = async (url) => {
  try {
    const controller = new AbortController();
    // 5 second timeout:
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 301 || response.status === 302) {
      const locationURL = new URL(
        response.headers.get("location"),
        response.url
      );
      if (response.headers.get("location").startsWith("http")) {
        await isRedirect(locationURL);
      } else {
        return response.headers.get("location");
      }
    } else if (response.status >= 200 && response.status < 300) {
      return response.url;
    } else {
      return response.url;
      // return null;
    }
  } catch (error) {
    // console.log({ error });
    return null;
  }
};

const getParsedFromMagnetorTorrentFile = (tor, uri) => {
  return new Promise(async (resolve, reject) => {
    try {
      let realUrl = uri;

      if (realUrl) {
        const childProcess = fork("./lib/childParser.js");

        childProcess.send({ url: realUrl, Cookie: tor.Cookie ?? "" });

        childProcess.on("message", (parsedData) => {
          resolve({ parsedTor: parsedData, ...tor });
          childProcess.kill();
        });

        childProcess.on("close", (code) => {
          resolve(null);
        });
      } else {
        resolve(null);
      }
    } catch (error) {
      console.log(error);
      resolve(null);
    }
  });
};

const toDLStream = async (
  torrents = [],
  { media, s, e, abs, abs_season, abs_episode }
) => {
  try {
    let hashes = torrents.map((tor) => tor.parsedTor.infoHash.toLowerCase());

    let magnetsData = await Promise.all(
      hashes.map((hash) => DebridLink.checkMagnet(hash))
    );

    if (magnetsData) {
      magnetsData = magnetsData.filter((el) => !!el);

      //mapped to torrents

      magnetsData = magnetsData.map((dl) => {
        try {
          let tor = torrents.find((tor) => {
            return tor.parsedTor.infoHash.toLowerCase() == dl.hashString;
          });

          return {
            ...tor,
            dl,
          };
        } catch (error) {
          console.log({ error });
          return null;
        }
      });

      magnetsData = magnetsData.filter((el) => !!el);

      let suitables = magnetsData.map((f) => {
        let idx = f.dl.files.findIndex((file) => {
          let lower = `${file["name"]}`.toLowerCase();
          if (!isVideo(file)) return false;
          return media == "series"
            ? getFittedFile(lower, s, e, abs, abs_season, abs_episode)
              ? true
              : false
            : true;
        });

        return idx == -1
          ? null
          : {
              ...f,
              index: idx,
            };
      });

      let streams = suitables.filter((f) => !!f);

      console.log({ fitted_dl: streams.length });

      //Match streams with torrents
      streams = streams.map((s, i) => {
        let index = "index" in s ? s["index"] : -1;
        let title =
          s["Title"] +
          "\n" +
          (s.parsedTor.files[index]["name"] || s["dl"]["files"][index]["name"]);
        let infoHash = s["parsedTor"].infoHash;

        return {
          name: `[⚡DL⚡] ${s["Tracker"]} ${getQuality(title)}`,
          type: media,
          infoHash,
          fileIdx: index == -1 ? 0 : index,
          url: s["dl"]["files"][index]["downloadUrl"],
          title:
            title +
            " " +
            getFlagFromName(title) +
            `\n${getSize(s["dl"]["files"][index]["size"])}`,
          behaviorHints: {
            notWebReady: true,
            bingeGroup: `001-Addon|${infoHash}`,
          },
        };
      });

      return streams;
    }
  } catch (error) {
    console.log({ error });
  }
  return [];
};
const toADStream = async (
  torrents = [],
  { media, s, e, abs, abs_season, abs_episode }
) => {
  try {
    let hashes = torrents.map((tor) => tor.parsedTor.infoHash.toLowerCase());

    let magnetsData = await AllDebrid.uploadMagnet(hashes);

    if (magnetsData) {
      let mappedIds = magnetsData.map((m) => m["id"]);
      let files = await AllDebrid.getFilesAndLinks(mappedIds);

      let mappedFiles = files.map((f) => {
        if ("files" in f) {
          return AllDebrid.parseFilesAndLinks(f.files);
        }
      });

      let suitables = mappedFiles.map((f) => {
        return f.find((file) => {
          let lower = `${file["name"]}`.toLowerCase();
          if (!isVideo(file)) return null;
          return media == "series"
            ? getFittedFile(lower, s, e, abs, abs_season, abs_episode)
              ? file
              : null
            : file;
        });
      });

      suitables = suitables.filter((f) => !!f);

      console.log({ fitted_ad: suitables.length });

      let streams = await Promise.all(
        suitables.map((f) => AllDebrid.unlockLink(f["link"]))
      );

      console.log({ streams: streams.length });

      //Match streams with torrents
      streams = streams.map((s, i) => {
        let suitableTorrent;
        let index = -1;
        let infoHash = "";

        try {
          suitableTorrent = torrents.find((tor) => {
            return tor.parsedTor.files
              .map((el) => el["name"])
              .includes(s["filename"]);
          });
          infoHash = suitableTorrent?.parsedTor?.infoHash;
          index = suitableTorrent.parsedTor.files.findIndex((el) => {
            return el["name"] == s["filename"];
          });
        } catch (error) {
          console.log({ error });
        }

        let title = !!suitableTorrent
          ? suitableTorrent["Title"] +
            "\n" +
            suitableTorrent.parsedTor.files[index]["name"]
          : s["filename"];

        let toReturn = {
          name: `[⚡AD⚡] ${suitableTorrent["Tracker"]} ${getQuality(title)}`,
          type: media,
          fileIdx: index == -1 ? 0 : index,
          url: s["link"],
          title:
            title +
            " " +
            getFlagFromName(title) +
            `\n${getSize(s["filesize"])}`,
          behaviorHints: {
            notWebReady: true,
          },
        };

        if (suitableTorrent) {
          toReturn = {
            ...toReturn,
            infoHash: infoHash,
            behaviorHints: {
              ...toReturn.behaviorHints,
              bingeGroup: `001-Addon|${infoHash}`,
            },
          };
        }

        return toReturn;
      });

      return streams;
    }
  } catch (error) {
    console.log({ error });
  }
  return [];
};

const toPMStream = async (
  torrents = [],
  { media, s, e, abs, abs_season, abs_episode }
) => {
  try {
    torrents = torrents.filter((tor) => {
      return !!tor.parsedTor && !!tor.parsedTor?.files;
    });

    torrents = torrents.map((tor) => {
      let parsed = tor.parsedTor;

      if (media == "series") {
        index = (parsed?.files ?? []).findIndex((element) => {
          if (!element["name"]) {
            return false;
          }

          let name = element["name"].toLowerCase();

          if (name.includes("live") || name.includes("ova")) {
            return false;
          }

          return (
            isVideo(element) &&
            getFittedFile(name, s, e, abs, abs_season, abs_episode)
          );
        });

        if (index == -1) {
          return null;
        }

        return {
          ...tor,
          index,
        };
      } else if (media == "movie") {
        index = (parsed?.files ?? []).findIndex((element, index) => {
          return isVideo(element);
        });
        //
        if (index == -1) {
          return null;
        }

        return {
          ...tor,
          index,
        };
      }

      return null;
    });

    //

    //================= PM ==================

    torrents = torrents.filter((tor) => !!tor);

    console.log({ fitted_pm: torrents.length });

    console.log("Trynna some PM");

    torrents = await Promise.all(
      torrents
        .filter((tor) => !!tor)
        .map(async (tor) => {
          let details = [];
          let infoHash = tor.parsedTor.infoHash.toLowerCase();

          let isCached = await PM.checkCached(infoHash);

          if (isCached) {
            let cache = await PM.getDirectDl(infoHash);
            console.log({ cache: cache?.length, name: isCached });
            if (cache && cache.length) {
              let index = -1;
              if (media == "series") {
                index = (cache ?? []).findIndex((element, _) => {
                  element["name"] =
                    element["path"].toLowerCase()?.split("/")?.pop() ??
                    (isCached ?? "").toLowerCase();

                  if (!element["name"]) return false;

                  if (
                    element["name"].match(/\W+movie\W+/) ||
                    element["name"].includes("live") ||
                    element["name"].includes("ova")
                  ) {
                    return false;
                  }

                  return (
                    isVideo(element ?? "") &&
                    getFittedFile(
                      element["name"],
                      s,
                      e,
                      abs,
                      abs_season,
                      abs_episode
                    )
                  );
                });

                if (index == -1) {
                  return null;
                }

                // console.log({ index });
              } else if (media == "movie") {
                index = (cache ?? []).findIndex((element) => {
                  element["name"] =
                    element["path"].toLowerCase() ||
                    (isCached || "").toLowerCase();
                  return isVideo(element || "");
                });

                if (index == -1) {
                  return null;
                }
              }
              console.log(`Cached index: ${index}`);
              details = [cache[index]];

              //return with dl details and index
              return {
                ...tor,
                details,
                dlIndex: index,
              };
            }
          }
          return tor;
        })
    );

    torrents = torrents.filter(
      (tor) => !!tor
      // (tor) => !!tor && !!tor.details && !isNaN(tor.details.length)
    );

    let streams = torrents.map((tor) => {
      let parsed = tor.parsedTor;
      let infoHash = tor.parsedTor.infoHash.toLowerCase();
      let index = tor?.index ?? tor?.dlIndex ?? -1;

      let title = tor.extraTag || parsed.name;
      title = !!title ? title + "\n" + parsed?.files[index]["name"] : null;
      title = title ?? parsed.files[index]["name"];
      title += "\n" + getQuality(title);
      const subtitle = "S:" + tor["Seeders"] + " | P:" + tor["Peers"];
      title += ` | ${
        index == -1 || parsed.files == []
          ? `${getSize(0)}`
          : `${getSize(parsed.files[index]["length"] ?? 0)}`
      } | ${subtitle}`;

      if (
        "details" in tor &&
        tor.details.length > 0 &&
        tor.details[tor.details.length > 1 ? tor.dlIndex : 0]["stream_link"]
      ) {
        return {
          name: `[⚡PM⚡] ${tor["Tracker"]} ${getQuality(title)}`,
          url:
            tor.details[tor.details.length > 1 ? tor.dlIndex : 0]["link"] ??
            tor.details[tor.details.length > 1 ? tor.dlIndex : 0][
              "stream_link"
            ],
          title:
            title ??
            tor.details[tor.details.length > 1 ? tor.dlIndex : 0]["name"],
          behaviorHints: {
            bingeGroup: `001-Addon|${infoHash}`,
          },
        };
      }

      // if (process.env.PUBLIC == "1")
      //   return {
      //     name: `${tor["Tracker"]}`,
      //     type: media,
      //     infoHash: infoHash,
      //     fileIdx: tor.index == -1 ? 0 : index,
      //     sources: (parsed.announce || [])
      //       .map((x) => {
      //         return "tracker:" + x;
      //       })
      //       .concat(["dht:" + infoHash]),
      //     title: title + getFlagFromName(title),
      //     behaviorHints: {
      //       bingeGroup: `001-Addon|${infoHash}`,
      //       notWebReady: true,
      //     },
      //   };

      return null;
    });

    streams = streams.filter((x) => !!x);

    return streams;
  } catch (error) {
    console.log({ PMError: error });
  }

  return [];
};

const toRDStream = async (
  torrents = [],
  { media, s, e, abs, abs_season, abs_episode }
) => {
  try {
    torrents = torrents.filter(
      (tor) => !!tor.parsedTor && !!tor.parsedTor.files
    );

    torrents = torrents.map((tor) => {
      let parsed = tor.parsedTor;

      if (media == "series") {
        index = (parsed?.files ?? []).findIndex((element) => {
          if (!element["name"]) {
            return false;
          }

          let name = element["name"].toLowerCase();

          if (name.includes("live") || name.includes("ova")) {
            return false;
          }

          return (
            isVideo(element) &&
            getFittedFile(name, s, e, abs, abs_season, abs_episode)
          );
        });

        if (index == -1) {
          return null;
        }
        return {
          ...tor,
          index,
        };
      } else if (media == "movie") {
        index = (parsed?.files ?? []).findIndex((element, index) => {
          return isVideo(element);
        });
        //
        if (index == -1) {
          return null;
        }

        return {
          ...tor,
          index,
        };
      }

      return null;
    });

    //================= PM ==================

    torrents = torrents.filter((tor) => !!tor);

    console.log({ fitted_rd: torrents.length });

    console.log(
      "Trynna some RD with " + torrents.length.toString() + " torrents"
    );

    let MAX_ELEMENT = torrents.length;
    let sleepArr = Array.from({ length: MAX_ELEMENT }, (_, i) => i * 900);

    torrents = await Promise.all(
      torrents.map(async (tor) => {
        let details = [];
        let infoHash =
          parseTorrent.toMagnetURI(tor.parsedTor) ||
          tor.parsedTor.infoHash.toLowerCase();

        let sleep = sleepArr.pop();
        // let sleep = sleepArr[Math.floor(Math.random() * MAX_ELEMENT)];

        console.log("sleeping before adding for " + sleep.toString() + " ms");
        await new Promise((r) => setTimeout(r, sleep));

        //console.log({ infoHash });

        let added = await RealDebrid.addTorrentFileinRD(infoHash);

        console.log({ added: added && "id" in added });

        return added && "id" in added
          ? {
              ...tor,
              rdId: added.id,
            }
          : null;
      })
    );

    torrents = torrents.filter((tor) => !!tor);
    sleepArr = Array.from({ length: torrents.length }, (_, i) => i * 900);

    torrents = await Promise.all(
      torrents.map(async (tor) => {
        try {
          let details = [];
          let sleep = sleepArr.pop();
          console.log(
            "sleeping before selecting for " + sleep.toString() + " ms"
          );
          await new Promise((r) => setTimeout(r, sleep));

          let selected = await RealDebrid.selectFilefromRD(tor.rdId);
          console.log({ selected });

          if (!selected) return false;

          let torrentDetails = await RealDebrid.getTorrentInfofromRD(tor.rdId);

          if (
            !torrentDetails ||
            !("status" in torrentDetails) ||
            torrentDetails["status"] != "downloaded"
          ) {
            console.log("not ready yet...deleting");
            let deleted = await RealDebrid.deleteTorrent(tor.rdId);
            console.log({ deleted });
            return false;
          }

          let files = (torrentDetails["files"] ?? []).filter(
            (el) => el["selected"] == 1
          );
          let links = torrentDetails["links"] ?? [];

          let selectedIndex =
            files.length == 1
              ? 0
              : files.findIndex((el) =>
                  el["path"]
                    ?.toLowerCase()
                    ?.includes(
                      tor.parsedTor.files[tor.index]["name"]?.toLowerCase()
                    )
                );
          console.log({ selectedIndex });
          details = [
            await RealDebrid.unrestrictLinkfromRD(links[selectedIndex] ?? null),
          ];

          return {
            ...tor,
            details,
          };
        } catch (error) {
          console.log({ error });
          return false;
        }
      })
    );

    torrents = torrents.filter((tor) => !!tor);

    let streams = torrents.map((tor) => {
      let parsed = tor.parsedTor;
      let infoHash = tor.parsedTor.infoHash.toLowerCase();
      let index = tor?.index ?? -1;

      let title = tor.extraTag || parsed.name;
      title = !!title ? title + "\n" + parsed?.files[index]["name"] : null;
      title = title ?? parsed.files[index]["name"];
      title += "\n" + getQuality(title);
      const subtitle = "S:" + tor["Seeders"] + " | P:" + tor["Peers"];
      title += ` | ${
        index == -1 || parsed.files == []
          ? `${getSize(0)}`
          : `${getSize(parsed.files[index]["length"] ?? 0)}`
      } | ${subtitle}`;

      if (
        tor?.details &&
        tor?.details?.length > 0 &&
        tor?.details[tor.details.length > 1 ? index : 0]["download"]
      ) {
        return {
          name: `[⚡RD⚡] ${tor["Tracker"]} ${getQuality(title)}`,
          url: tor?.details[tor.details.length > 1 ? index : 0]["download"],
          title:
            title ??
            tor?.details[tor.details.length > 1 ? index : 0]["filename"],
          behaviorHints: {
            bingeGroup: `001-Addon|${infoHash}`,
          },
        };
      }

      if (process.env.PUBLIC == "1")
        return {
          name: `${tor["Tracker"]} ${getQuality(title)}`,
          type: media,
          infoHash: infoHash,
          fileIdx: index == -1 ? 0 : index,
          sources: (parsed.announce || [])
            .map((x) => {
              return "tracker:" + x;
            })
            .concat(["dht:" + infoHash]),
          title: title + getFlagFromName(title),
          behaviorHints: {
            bingeGroup: `001-Addon|${infoHash}`,
            notWebReady: true,
          },
        };

      return null;
    });

    streams = streams.filter((x) => !!x);

    console.log({ streams: streams.length });

    return streams;
  } catch (error) {
    console.log({ RDError: error });
  }

  return [];
};

const toStream = async (
  tor,
  type,
  s,
  e,
  abs_season,
  abs_episode,
  abs,
  max_element
) => {
  let parsed = tor?.parsedTor;
  if (!parsed) return null;

  const infoHash = parsed.infoHash.toLowerCase();
  let title = tor.extraTag || parsed.name;
  let index = -1;

  if (!parsed.files) {
    return null;
  }

  if (media == "series") {
    index = (parsed?.files ?? []).findIndex((element, index) => {
      if (!element["name"]) {
        return false;
      }

      let name = element["name"].toLowerCase();

      if (name.includes("live") || name.includes("ova")) {
        return false;
      }

      return (
        isVideo(element) &&
        getFittedFile(name, s, e, abs, abs_season, abs_episode)
      );
    });

    if (index == -1) {
      return null;
    }

    title = !!title ? title + "\n" + parsed.files[index]["name"] : null;
  } else if (media == "movie") {
    index = (parsed?.files ?? []).findIndex((element, index) => {
      return isVideo(element);
    });
    //
    if (index == -1) {
      return null;
    }
  }

  //================= PM ==================

  console.log("Trynna some PM");
  let folderId = null;
  let details = [];

  let isCached = await PM.checkCached(infoHash);
  console.log({ isCached });
  if (isCached) {
    let cache = await PM.getDirectDl(infoHash);
    if (cache && cache.length) {
      if (media == "series") {
        index = (cache ?? []).findIndex((element, _) => {
          element["name"] =
            element["path"].toLowerCase()?.split("/")?.pop() ??
            (isCached ?? "").toLowerCase();

          if (!element["name"]) return false;

          if (
            element["name"].match(/\W+movie\W+/) ||
            element["name"].includes("live") ||
            element["name"].includes("ova")
          ) {
            return false;
          }

          return (
            isVideo(element ?? "") &&
            getFittedFile(element["name"], s, e, abs, abs_season, abs_episode)
          );
        });

        if (index == -1) {
          return null;
        }
      } else if (media == "movie") {
        index = (cache ?? []).findIndex((element, index) => {
          element["name"] =
            element["path"].toLowerCase() ?? (isCached ?? "").toLowerCase();
          return isVideo(element ?? "");
        });
        if (index == -1) {
          return null;
        }
      }
      details = [cache[index]];
      console.log(`Cached index: ${index}`);
    }
  } else {
    let data = null;
    data = await PM.checkTorrentFileinPM(parsed.name);
    if (data) {
      if (data["type"] == "folder") {
        folderId = data["id"];
        if (folderId) {
          details = await PM.pmFolderDetails(folderId);
          console.log({ status: details.length ? "found" : "nothing" });
        }
      } else if (data["type"] == "file") {
        details = [data];
      }
    } else {
      console.log("should add to pm");
      // let addRes = null;
      if (nbreAdded <= 5) {
        let addRes = await PM.addMagnetToPM(parseTorrent.toMagnetURI(parsed));
        console.log({ added: !!addRes });
        !!addRes ? nbreAdded++ : null;
        folderId = !!addRes
          ? await PM.pmFolderId(addRes ?? parsed["name"])
          : null;
        if (folderId) {
          details = await PM.pmFolderDetails(folderId);
          console.log({ status: details.length ? "found2" : "nothing2" });
        }
      }
    }
  }

  title = title ?? parsed.files[index]["name"];

  title += "\n" + getQuality(title);

  const subtitle = "S:" + tor["Seeders"] + " | P:" + tor["Peers"];
  title += ` | ${
    index == -1 || parsed.files == []
      ? `${getSize(0)}`
      : `${getSize(parsed.files[index]["length"] ?? 0)}`
  } | ${subtitle}`;

  if (
    details.length > 0 &&
    details[details.length > 1 ? index : 0]["stream_link"]
  ) {
    return {
      name: `PM-${tor["Tracker"]}`,
      url:
        details[details.length > 1 ? index : 0]["link"] ??
        details[details.length > 1 ? index : 0]["stream_link"],
      title: title ?? details[details.length > 1 ? index : 0]["name"],
      behaviorHints: {
        bingeGroup: `001-Addon|${infoHash}`,
      },
    };
  }

  if (process.env.PUBLIC == "1")
    return {
      name: `${tor["Tracker"]}`,
      type: type,
      infoHash: infoHash,
      fileIdx: index == -1 ? 0 : index,
      sources: (parsed.announce || [])
        .map((x) => {
          return "tracker:" + x;
        })
        .concat(["dht:" + infoHash]),
      title: title + getFlagFromName(title),
      behaviorHints: {
        bingeGroup: `001-Addon|${infoHash}`,
        notWebReady: true,
      },
    };
};

const qualities = {
  "4k": "🌟4k",
  fhd: "🎥FHD",
  hd: "📺HD",
  sd: "📱SD",
  unknown: "none",
};

const vf = ["vf", "vff", "french", "frn"];
const multi = ["multi"];
const vostfr = ["vostfr", "english", "eng"];

let isVideo = (element) => {
  return (
    element["name"]?.toLowerCase()?.includes(`.mkv`) ||
    element["name"]?.toLowerCase()?.includes(`.mp4`) ||
    element["name"]?.toLowerCase()?.includes(`.avi`) ||
    element["name"]?.toLowerCase()?.includes(`.flv`)
  );
};

const getFittedFile = (name, s, e, abs = false, abs_season, abs_episode) => {
  return (
    containEandS(name, s, e, abs, abs_season, abs_episode) ||
    containE_S(name, s, e, abs, abs_season, abs_episode) ||
    (s == 1 &&
      (containsAbsoluteE(name, s, e, true, s, e) ||
        containsAbsoluteE_(name, s, e, true, s, e))) ||
    (((abs && containsAbsoluteE(name, s, e, abs, abs_season, abs_episode)) ||
      (abs && containsAbsoluteE_(name, s, e, abs, abs_season, abs_episode))) &&
      !(
        name?.includes("s0") ||
        name?.includes(`s${abs_season}`) ||
        name?.includes("e0") ||
        name?.includes(`e${abs_episode}`) ||
        name?.includes("season")
      ))
  );
};

function getSize(size) {
  var gb = 1024 * 1024 * 1024;
  var mb = 1024 * 1024;

  return (
    "💾 " +
    (size / gb > 1
      ? `${(size / gb).toFixed(2)} GB`
      : `${(size / mb).toFixed(2)} MB`)
  );
}

function getQuality(name) {
  if (!name) {
    return name;
  }
  name = name.toLowerCase();

  if (["2160", "4k", "uhd"].some((x) => name.includes(x)))
    return " " + qualities["4k"];
  if (["1080", "fhd"].some((x) => name.includes(x))) return " " + qualities.fhd;
  if (["720", "hd"].some((x) => name.includes(x))) return " " + qualities.hd;
  if (["480p", "380p", "sd"].some((x) => name.includes(x)))
    return " " + qualities.sd;
  return "";
}

const isSomeContent = (file_name = "", langKeywordsArray = []) => {
  file_name = file_name.toLowerCase();
  return langKeywordsArray.some((word) => file_name.includes(word));
};

const isVfContent = (file_name) => isSomeContent(file_name, vf);
const isMultiContent = (file_name) => isSomeContent(file_name, multi);
const isVostfrContent = (file_name) => isSomeContent(file_name, vostfr);

const bringFrenchVideoToTheTopOfList = (streams = []) => {
  streams.sort((a, b) => {
    let a_lower = a.title.toLowerCase();
    let b_lower = b.title.toLowerCase();
    return isVfContent(a_lower) ||
      isVostfrContent(a_lower) ||
      isMultiContent(a_lower)
      ? -1
      : isVfContent(b_lower) ||
        isVostfrContent(b_lower) ||
        isMultiContent(a_lower)
      ? 1
      : 0;
  });
  return streams;
};

const filterBasedOnQuality = (streams = [], quality = "") => {
  if (!quality) return [];
  if (!Object.values(qualities).includes(quality)) return [];

  if (quality == qualities.unknown) {
    streams = streams.filter((el) => {
      const l = `${el?.name}`;
      return (
        !l.includes(qualities["4k"]) &&
        !l.includes(qualities.fhd) &&
        !l.includes(qualities.hd) &&
        !l.includes(qualities.sd)
      );
    });
  } else {
    streams = streams.filter((el) => el.name.includes(quality));
  }

  console.log({ filterBasedOnQuality: streams.length, quality });
  return bringFrenchVideoToTheTopOfList(streams);
};

const getFlagFromName = (file_name) => {
  switch (true) {
    case isVfContent(file_name):
      return "| 🇫🇷";
    case isMultiContent(file_name):
      return "| 🌐";
    case isVostfrContent(file_name):
      return "| 🇬🇧";
    default:
      return "| 🏴󠁰󠁴󠀰󠀶󠁿";
  }
};

let cleanName = (name = "") => {
  return name
    .replaceAll("-", " ")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/['<>:]/g, "");
};

let simplifiedName = (name = "") => {
  let splitName = name.includes("-") ? name.split("-")[0] : name;
  splitName = splitName.trim();
  name = splitName.split(" ").length > 1 ? splitName : name;
  // name = name.includes(":") ? name.split(":")[0] : name;
  name = name.trim();
  return cleanName(name);
};

module.exports = {
  containEandS,
  containE_S,
  containsAbsoluteE,
  containsAbsoluteE_,
  getMeta,
  getImdbFromKitsu,
  isRedirect,
  getParsedFromMagnetorTorrentFile,
  toStream,
  isVideo,
  getSize,
  getQuality,
  filterBasedOnQuality,
  qualities,
  bringFrenchVideoToTheTopOfList,
  getFlagFromName,
  cleanName,
  simplifiedName,
  getFittedFile,
  toDLStream,
  toADStream,
  toPMStream,
  toRDStream,
  fetchNyaaRssTorrent,
  fetchNyaa,
  fetchNyaaRssTorrent2,
  queue,
};
