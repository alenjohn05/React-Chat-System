"use strict";

const request = require("request");
const socketioJwt = require("socketio-jwt");
const redisAdapter = require("socket.io-redis");
const JWT_SECRET = require("./config").jwt_secret;
const REDIS_URL = require("./config").redis_url;
const REDIS_PORT = require("./config").redis_port;
const REDIS_PASSWD = require("./config").redis_passwd;

module.exports = function (io, colors, handlerObj, log) {
  io.set("transports", ["websocket"]);
  io.set("upgrade", false);
  if (JWT_SECRET) {
    io.use(
      socketioJwt.authorize({
        secret: JWT_SECRET,
        handshake: true,
      })
    );
  }

  var sendToAdmins = function (tid, msgTag, data) {
    var room = "Admin" + tid;
    io.to(room).emit(msgTag, data);
  };

  io.adapter(
    redisAdapter({ host: REDIS_URL, port: REDIS_PORT, auth_pass: REDIS_PASSWD })
  );
  // on every node
  io.of("/").adapter.customHook = (data, cb) => {
    var userData = [];
    if (data == "getUserId") {
      Object.keys(io.engine.clients).map((id) => {
        const clientSocket = io.sockets.connected[id];
        userData.push({ userid: clientSocket.viz_userId, socketid: id });
      });
      cb(userData);
    } else if (data == "getGuid") {
      Object.keys(io.engine.clients).map((id) => {
        const clientSocket = io.sockets.connected[id];
        if (clientSocket.guid)
          userData.push({ guid: clientSocket.guid, socketid: id });
      });
      cb(userData);
    } else if (data == "gethandlerObj") {
      cb(handlerObj);
    } else if (data.split("-")[0] == "removeHandler") {
      var tid = data.split("-")[1];
      var adminID = data.split("-")[2];
      if (handlerObj.hasOwnProperty(tid)) {
        Object.keys(handlerObj[tid]).forEach(function (key) {
          Object.keys(handlerObj[tid][key]).forEach(function (key2) {
            Object.keys(handlerObj[tid][key][key2]).forEach(function (key3) {
              if (
                handlerObj[tid][key][key2].adminId &&
                handlerObj[tid][key][key2].adminId == adminID
              ) {
                handlerObj[tid][key][key2] = "";
                sendToAdmins(tid, "broadcast_handlerRemove", { guid: key });
                cb({ guid: key, workflowId: key2, adminId: adminID });
              }
            });
          });
        });
      }
      cb("");
    } else if (data.split("-")[0] == "getUserSockets") {
      var userId = data.split("-")[1];
      Object.keys(io.engine.clients).map((id) => {
        const clientSocket = io.sockets.connected[id];
        if (clientSocket.viz_userId == userId) {
          userData.push({ socketid: id });
        }
      });
      log.info("userData:::::".green, userData);
      cb(userData);
    } else if (data.split("-")[0] == "wfLockUser") {
      var wfid = data.split("-")[1];
      var tid = data.split("-")[2];
      Object.keys(io.engine.clients).some((id) => {
        const clientSocket = io.sockets.connected[id];
        if (
          clientSocket.wf_edit === wfid &&
          clientSocket.viz_email &&
          parseInt(clientSocket.viz_tid) === parseInt(tid)
        ) {
          userData.push({
            username: clientSocket.viz_username,
            userid: clientSocket.viz_userId,
            tid: clientSocket.viz_tid,
            email: clientSocket.viz_email,
          });
          return true;
        }
      });
      log.info("wfLockUser:::::".green, userData);
      cb(userData);
    } else if (data.split("-")[0] == "wfUnlockUser") {
      var user = [];
      Object.keys(io.engine.clients).some((id) => {
        const clientSocket = io.sockets.connected[id];
        if (
          clientSocket.wf_edit === data.split("-")[1] &&
          clientSocket.viz_email &&
          parseInt(clientSocket.viz_userId) === parseInt(data.split("-")[3]) &&
          parseInt(clientSocket.viz_tid) === parseInt(data.split("-")[2])
        ) {
          clientSocket.wf_edit = "";
          user.push({
            username: clientSocket.viz_username,
            userid: clientSocket.viz_userId,
            tid: clientSocket.viz_tid,
            email: clientSocket.viz_email,
          });
          return true;
        }
      });
      log.info("wfUnlockUser:::::".green, user);
      cb(user);
    } else if (data.split("-")[0] == "lsLockUser") {
      var lsShortCode = data.split("-")[1];
      var tid = data.split("-")[2];
      var type = data.split("-")[3];
      var userId = data.split("-")[4];
      Object.keys(io.engine.clients).some((id) => {
        const clientSocket = io.sockets.connected[id];
        if (
          clientSocket[`ls_edit_${type}`] == lsShortCode &&
          clientSocket.viz_email &&
          parseInt(clientSocket.viz_userId) === parseInt(userId) &&
          parseInt(clientSocket.viz_tid) === parseInt(tid)
        ) {
          userData.push({
            username: clientSocket.viz_username,
            userid: clientSocket.viz_userId,
            tid: clientSocket.viz_tid,
            email: clientSocket.viz_email,
          });
          return true;
        }
      });
      log.info("lsLockUser:::::".green, userData);
      cb(userData);
    } else if (data.split("-")[0] == "lsUnlockUser") {
      var user = [];
      var type = data.split("-")[3];
      Object.keys(io.engine.clients).some((id) => {
        const clientSocket = io.sockets.connected[id];
        if (
          clientSocket[`ls_edit_${type}`] == data.split("-")[1] &&
          clientSocket.viz_email &&
          parseInt(clientSocket.viz_userId) === parseInt(data.split("-")[4]) &&
          parseInt(clientSocket.viz_tid) === parseInt(data.split("-")[2])
        ) {
          clientSocket[`ls_edit_${type}`] = "";
          user.push({
            username: clientSocket.viz_username,
            userid: clientSocket.viz_userId,
            tid: clientSocket.viz_tid,
            email: clientSocket.viz_email,
          });
          return true;
        }
      });
      log.info("lsUnlockUser:::::".green, user);
      cb(user);
    }
  };

  io.on("connection", function (socket) {
    io.of("/").adapter.clients((err, clients) => {
      log.info("No of socket connections:::".green, clients.length);
    });

    require("../controllers/chatController")(
      socket,
      io,
      colors,
      handlerObj,
      log,
      request
    );
    require("../controllers/realtimeController")(
      socket,
      io,
      colors,
      log,
      request
    );
  });
};
