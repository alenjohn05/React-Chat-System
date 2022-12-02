var express = require("express");
var router = express.Router();
const request = require("request");
const log = require("./log");
const WEB_DOMAIN = require("./config").web_domain;

function ssUpdate(io, room, args, data) {
  return new Promise((Rootresolve) => {
    io.in(room).clients((err, clients) => {
      const usersInAppSockets = clients; //get active users in the app

      io.of("/").adapter.customRequest("getUserId", function (err, replies) {
        if (err) log.error("io.of.getUserId:::".red, err);
        var allUsers = replies.filter(Boolean);
        allUsers = Array.prototype.concat(...allUsers);
        for (var ids of allUsers) {
          if (usersInAppSockets.includes(ids.socketid)) {
            const clientUserId = ids.userid;
            args["args"]["active-user-ids"].push(clientUserId);
          }
        }

        var web_service_domain = WEB_DOMAIN;
        if (data.web_domain)
          web_service_domain = "https://" + data.web_domain + "/sys/api.v2";

        new Promise((resolve, reject) => {
          request(
            {
              url: web_service_domain,
              method: "POST",
              form: args,
            },
            function (error, response, body) {
              if (error) log.error("app.userRowData post error:::".red, error);
              if (!error && body) {
                try {
                  body = JSON.parse(body.trim());
                } catch (e) {
                  log.error("app.userRowData parse error:::".red, e);
                }
                if (body.Body) {
                  const appUsersData = body.Body;

                  /*-------emit data to the corresponding users-----------*/
                  for (const clientId of usersInAppSockets) {
                    var pickedSock = allUsers.find(
                      (o) => o.socketid === clientId
                    );
                    var clientUserId = pickedSock.userid;
                    const emitTag = "ss_dataChange";
                    var emitData = {};
                    emitData["dnaFilter"] = appUsersData["dnaFilter"];
                    emitData["data"] = appUsersData[clientUserId];
                    if (emitData["data"] && emitData["data"].length != 0) {
                      io.to(clientId).emit(emitTag, emitData);
                    }
                  }
                  Rootresolve({ status: "success" });
                  /*-------emit data to the corresponding users ends-----------*/
                }
              }
            }
          );
        });
      });
    });
  });
}

// define the home page route
router.get("/", function (req, res) {
  res.sendFile("index.html");
});

router.post("/viz_custom", function (req, res) {
  log.info("viz_custom:::".green, req.body);
  var io = req.app.get("io");
  var uid =
    req.body.payload && req.body.payload.uid ? req.body.payload.uid : null;
  if (uid) {
    io.of("/").adapter.customRequest("getUserId", function (err, replies) {
      if (err) log.error("io.of.getUserId:::".red, err);
      var allUsers = replies.filter(Boolean);
      allUsers = Array.prototype.concat(...allUsers);
      var snt = false;
      for (var usr of allUsers) {
        if (usr.userid == uid) {
          snt = true;
          io.to(usr.socketid).emit("viz_custom", req.body);
        }
      }
      snt
        ? res.status(200).json({ status: "data sent" })
        : res.status(200).json({ error: "user not found" });
    });
  } else {
    res.status(200).json({ error: "uid not found in request" });
  }
});

router.post("/emit_block", function (req, res) {
  log.info("emit_block:::::".green, req.body);
  var reqData = req.body;
  var io = req.app.get("io");
  var identifier = reqData.identifier;
  var identifierArr = identifier.split("_");
  var identifierKey = identifierArr[0];
  var identifierVal =
    reqData.identifier_value || identifier.split(`${identifierKey}_`)[1];
  var ioTag = identifierKey == "guid" ? "getGuid" : "getUserId";
  var tagName = reqData.tags;
  try {
    var data = JSON.parse(reqData.dataset.trim());
  } catch (e) {
    log.error("reqData.dataset parse error:::".red, e);
    return;
  }

  io.of("/").adapter.customRequest(ioTag, function (err, replies) {
    if (err) log.error(`io.of.ioTag::${ioTag}::`.red, err);
    var allUsers = replies.filter(Boolean);
    allUsers = Array.prototype.concat(...allUsers);
    var snt = false;
    for (var usr of allUsers) {
      if (usr[identifierKey] == identifierVal) {
        snt = true;
        var fetch_socket = io.sockets.sockets[usr.socketid];
        if (
          tagName === "new_message" &&
          (typeof fetch_socket.saveLogs == "undefined" || fetch_socket.saveLogs)
        ) {
          var logdomain =
            fetch_socket.logdomain === "127.0.0.1"
              ? "receiver-web"
              : fetch_socket.logdomain;
          var logurl = "https://" + logdomain + "/sys/api.v2";
          var args = [];
          args["args"] = [];
          args["op"] = "realtime.real";
          args["domian"] = fetch_socket.logdomain;
          args["args"]["user-id"] =
            fetch_socket.apiUserId || fetch_socket.adminId;
          args["args"]["params"] = [];
          args["args"]["params"]["action"] = "post";
          args["args"]["params"]["to"] = fetch_socket.guid;
          args["args"]["params"]["from"] = fetch_socket.workflowId;
          args["args"]["params"]["agent"] = "workflow_mode";
          if (fetch_socket.device)
            args["args"]["params"]["device"] = fetch_socket.device;
          if (data.Body) args["args"]["params"]["body"] = data.Body;
          if (data.workflow_log_id)
            args["args"]["params"]["workflow_log_id"] = data.workflow_log_id;
          request.post(
            {
              url: logurl,
              method: "POST",
              form: args,
            },
            function (error, response, body) {
              if (error) log.error("emit block log save error:::".red, error);
              var adminRoom = "Admin" + fetch_socket.tid;
              data.guid = fetch_socket.guid;
              data.workflowId = fetch_socket.workflowId;
              data.author = "workflow";
              io.to(adminRoom).emit("realtime_msg", data);
            }
          );
        }
        io.to(usr.socketid).emit(tagName, data);
      }
    }
    snt
      ? res.status(200).json({ status: "data sent" })
      : res.status(200).json({ error: "user not found" });
  });
});

// define the ssUpdate route
router.post("/ssUpdate", function (req, res) {
  var data = req.body;
  log.info("ssUpdate:::::".green, data);
  var tid = data.tid;
  var roomPrefix = tid + "_";
  var io = req.app.get("io");
  var appObjectIdArr = data.app_object_ids;
  var appIdArr = [];
  var appObjectsArr = {};
  res.status(200).json({ status: "data received" });

  for (var i = 0; i < appObjectIdArr.length; i++) {
    const objIdArr = appObjectIdArr[i].split("-");

    const item = objIdArr[0] + "_viz_" + objIdArr[1];
    var objFlag = 0;

    //get corresponding apps (tid_appid combination) [build appIdArr array]
    appIdArr.indexOf(item) === -1 ? appIdArr.push(item) : (objFlag = 1);

    //get objects under apps [build appObjectsArr array]
    objFlag == 1
      ? appObjectsArr[objIdArr[1]].push(objIdArr[2])
      : (appObjectsArr[objIdArr[1]] = [objIdArr[2]]);
  }

  io.of("/").adapter.allRooms(async (err, rooms) => {
    if (err) log.error("io.of.allRooms:::".red, err);
    for (var room of rooms) {
      if (room.trim().indexOf(roomPrefix) === 0) {
        const roomIdArr = room.split("_viz_");
        const roomName = roomIdArr[0] + "_viz_" + roomIdArr[1];

        if (appIdArr.includes(roomName)) {
          //check whether the app is active for user
          const appId = parseInt(roomIdArr[1]); //get appid from room name

          //retrieve all the rowdata based on the user in the app
          var args = [];
          args["args"] = [];
          args["args"]["user-id"] = data.user_id;
          args["args"]["livespace-id"] = data.lid;
          args["op"] = "liveapps.realtime.userRowData";
          args["args"]["tid"] = data.tid;
          args["args"]["app-id"] = appId;
          args["args"]["app-objectIds"] = appObjectsArr[appId];
          args["args"]["active-user-ids"] = [];
          args["args"]["row-id"] = data.row_id;
          args["args"]["action"] = data.action;

          if (roomIdArr[2]) {
            //check dna filter exist
            const dnaFilter = roomIdArr[2] + "_viz_" + roomIdArr[3];
            args["args"]["dnaFilter"] = dnaFilter;
          }

          await ssUpdate(io, room, args, data);
        }
      }
    }
  });
});

router.post("/background_service", function (req, res) {
  log.info("background_service:::::".green, req.body);
  var reqData = req.body;

  var io = req.app.get("io");

  var userId = reqData.USER_ID || reqData.userId;
  var tagName = reqData.tag;

  var ioTag = "getUserSockets-" + userId;

  io.of("/").adapter.customRequest(ioTag, function (err, replies) {
    if (err) log.error(`io.of.ioTag::${ioTag}::`.red, err);

    var allUsers = replies.filter(Boolean);
    allUsers = Array.prototype.concat(...allUsers);
    var snt = false;
    for (var usr of allUsers) {
      io.to(usr.socketid).emit(tagName, reqData);
    }
    snt
      ? res.status(200).json({ status: "data sent" })
      : res.status(200).json({ error: "user not found" });
  });
});

module.exports = router;
