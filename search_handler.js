const UTILS = require("./utils");

let search = async ({
  fn = () => {},
  query,
  media,
  s,
  e,
  abs,
  abs_season,
  abs_episode,
  meta,
}) => {
  let result = [];
  let batchResult = [];

  if (!query) return { batchResult, result };
  if (query?.length == 0) return { batchResult, result };
  if (!fn) return { batchResult, result };

  if (media == "movie") {
    query += " " + meta?.year;
    result = await UTILS.queue(
      [() => fn(encodeURIComponent(UTILS.simplifiedName(query)), "movie")],
      1
    );
  } else if (media == "series") {
    let batchPromises = [];
    let promises = [
      () =>
        fn(
          encodeURIComponent(
            `${UTILS.simplifiedName(query)} S${s?.padStart(
              2,
              "0"
            )}E${e?.padStart(2, "0")}`
          )
        ),
    ];

    batchPromises = [
      ...batchPromises,
      () =>
        fn(encodeURIComponent(`${UTILS.simplifiedName(query)}`), "series", s),
    ];

    if (abs) {
      promises = [
        ...promises,
        () =>
          fn(
            encodeURIComponent(
              `${UTILS.simplifiedName(query)} ${abs_episode?.padStart(3, "0")}`
            )
          ),
      ];

      batchPromises = [
        ...batchPromises,
        // () => fn(encodeURIComponent(`${UTILS.simplifiedName(query)} complete`)),
        () => fn(encodeURIComponent(`${UTILS.simplifiedName(query)} batch`)),
      ];
    } else {
      if (+s == 1) {
        promises = [
          ...promises,
          () =>
            fn(
              encodeURIComponent(
                `${UTILS.simplifiedName(query)} ${e?.padStart(2, "0")}`
              )
            ),
        ];
      }
    }

    result = await UTILS.queue(promises, 2);
    batchResult = await UTILS.queue(batchPromises, 2);
  }

  return { result, batchResult };
};

module.exports = { search };
