const config = {
  id: "daiki.animeotest.stream",
  version: "1.0.1",
  name: "Nyaa",
  description: "Anime Movie & TV from Nyaa ",
  logo: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPHOPU9E_uh7rBn6URYM8SjqRBGne4pOTlbw&s",
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
