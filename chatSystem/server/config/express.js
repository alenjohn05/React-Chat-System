"use strict";

const { constants } = require('crypto');
const path = require("path");
const express = require("express");
const fs = require("fs");
const colors = require("colors");
const https = require("https");
const http = require("http");
const socketio = require("socket.io");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const log = require("./log");
const routes = require("./routes");
const session = require("express-session");
const RedisStore = require("connect-redis")(session);

const PROTOCOL = require("./config").protocol;
const PORT = require("./config").port;
const CERT_PATH = require("./config").cert_path;
const CERT_KEY_PATH = require("./config").cert_key_path;
const CA_CERT_PATH = require("./config").ca_cert_path;
const SECRET = require("./config").jwt_secret;
const REDIS_URL = require("./config").redis_url;
const REDIS_PORT = require("./config").redis_port;
const REDIS_PASSWD = require("./config").redis_passwd;

module.exports = function () {
  var app = express();
  var server;
  var handlerObj = {};
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  if (PROTOCOL == "https") {
    var privateKey = fs.readFileSync(CERT_KEY_PATH, "utf8");
    var certificate = fs.readFileSync(CERT_PATH, "utf8");
    var ca = fs.readFileSync(CA_CERT_PATH, "utf-8");

    var credentials = {
      secureOptions: constants.SSL_OP_NO_TLSv1 | constants.SSL_OP_NO_TLSv1_1,
      key: privateKey,
      cert: certificate,
      ca: ca
    };
    server = https.createServer(credentials, app);
  } else {
    server = http.createServer(app);
  }

  const io = socketio.listen(server);

  // Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    session({
      secret: SECRET,
      saveUninitialized: true,
      resave: true,
      store: new RedisStore({
        host: REDIS_URL,
        port: REDIS_PORT,
        auth_pass: REDIS_PASSWD,
      }),
    })
  );

  // Serving static files
  app.use(express.static(path.join(__dirname, "../../public")));
  app.set("io", io);

  app.use("/", routes);

  require("./socketio.js")(io, colors, handlerObj, log);

  server.listen(PORT, function () {
    log.info(
      colors.green(
        `SocketIO:::${app.get(
          "env"
        )}:::${PROTOCOL}> listening on port-->${PORT}`
      )
    );
  });

  return app;
};
