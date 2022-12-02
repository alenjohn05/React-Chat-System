module.exports = {
  protocol: "https",
  defaultViewPortWidth: 1680,
  defaultViewPortHeight: 1932 - 350,
  port: process.env.PORT || 3000,
  debug_mode: false,
  jwt_secret: "secret",
  redis_url: "127.0.0.1",
  redis_port: 6379,
  redis_passwd: "test"
};
