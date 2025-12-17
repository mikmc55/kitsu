const { createClient } = require("redis");

const redisClient = () => {
  const pass = process.env.REDIS_PASSWORD;
  const url = process.env.REDIS_URL;
  const port = process.env.REDIS_PORT;

  if (!pass || !url || !port) return null;

  const client = createClient({
    url: `rediss://default:${pass}@${url}:${port}`,
    socket: {
      timeout: 10000,
    },
  });

  client.on("error", function (err) {
    console.log("Redis Client Error", err);
    return null;
  });

  return client;
};

module.exports = redisClient;