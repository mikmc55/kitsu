const config = {
  id: "daiki.animeotest.stream",
  version: "1.0.1",
  name: "Animeo Test",
  description: "Anime Movie & TV from Nyaa ",
  logo: "https://ia804607.us.archive.org/13/items/github.com-Jackett-Jackett_-_2022-01-03_07-53-24/__ia_thumb.jpg",
  resources: [
    {
      name: "stream",
      types: ["movie", "series", "anime"],
      idPrefixes: ["tt", "kitsu"],
    },
  ],
  types: ["movie", "series", "anime", "other"],
  catalogs: [],
};

module.exports = config;
