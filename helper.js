const removeDuplicate = (data = [], key = "name") => {
  let response = [];
  data.forEach((one, i) => {
    let index_ = response.findIndex((el) => el[key] == one[key]);
    index_ == -1 ? response.push(one) : null;
  });
  return response;
};

const REGEX = {
  season_range:
    /S(?:(eason )|(easons )|(eason )|(easons )|(aisons )|(aison ))?(?<start>\d{1,2})\s*?(?:-|&|à|et|to|~)\s*?(?<end>\d{1,2})/i,

  ep_range:
    /(?:(?:e)|(?:ep)|(?:episode)|(?:episodes))?\s*(?<start>\d{1,4})\s*(?:-|~|to|→)\s*(?<end>\d{1,4})/i,

  ep_rangewithS:
    /(?:(?:e)|(?:pisode)|(?:pisodes))\s*(?<start>\d{1,3}(?!\d)|\d\d\d??)(?:-?e?(?<end>\d{1,3}))?(?!\d)/i,

  date_patterns: [
    /(?<!\d)(?:19|20)\d{2}(?!\d)/, // Year like 2023
    /(?<!\d)\d{2}[\.-]\d{2}[\.-](?:19|20)\d{2}(?!\d)/, // DD-MM-YYYY or DD.MM.YYYY
    /(?<!\d)(?:19|20)\d{2}[\.-]\d{2}[\.-]\d{2}(?!\d)/, // YYYY-MM-DD or YYYY.MM.DD
  ],
};

const getRanges = (title, year = null) => {
  const ranges = {
    seasons: null,
    episodes: null,
    dates: [],
  };

  // Detect dates first
  REGEX.date_patterns.forEach((pattern) => {
    const matches = title.match(pattern);
    if (matches) {
      ranges.dates.push(matches[0]);
    }
  });

  // Filter out date matches before checking ranges
  let cleanTitle = title;
  ranges.dates.forEach((date) => {
    cleanTitle = cleanTitle.replace(date, "");
  });

  // Rest of the range detection logic using cleanTitle
  const seasonMatch = cleanTitle.match(REGEX.season_range);
  if (seasonMatch?.groups) {
    const start = parseInt(seasonMatch.groups.start);
    const end = parseInt(seasonMatch.groups.end);
    if (!(start === year || end === year)) {
      ranges.seasons = { start, end };
    }
  }

  const epMatch =
    cleanTitle.match(REGEX.ep_range) || cleanTitle.match(REGEX.ep_rangewithS);
  if (epMatch?.groups) {
    const start = parseInt(epMatch.groups.start);
    const end = parseInt(epMatch.groups.end);
    if (!(start === year || end === year)) {
      ranges.episodes = { start, end };
    }
  }

  return ranges;
};

let getAvatarName = (name = "") => {
  let avatar = name.split(" ");
  avatar = avatar.map((el) => el.charAt(0));
  return avatar.join("").toUpperCase();
};

let cleanKitsuName = (name = "") => {
  return name
    .replace(/(S|s)eason\s\d{1,3}/gim, "")
    .replace(/(\(\d{1,}\))/gim, "")
    .replace(/\s\d{1,3}/gim, "")
    .trim();
};

function isLatinValid(str) {
  // Regex pattern for Latin alphabet, numbers and special characters
  const latinPattern = /^[a-zA-ZÀ-ÿ0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?\s]+$/;
  return latinPattern.test(str);
}

module.exports = {
  removeDuplicate,
  getRanges,
  REGEX,
  getAvatarName,
  cleanKitsuName,
  isLatinValid,
};
