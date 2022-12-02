const WEB_DOMAIN = require("../config/config").web_domain;

module.exports = function (socket, io, colors, log, request) {
  socket.on("app_switch", function (data) {
    log.info("app_switch:::".green, data);
    var groupName = data.tid + "_viz_" + data.appId;

    var dnaFilter = data.dnaFilter;
    if (dnaFilter != "") groupName = groupName + "_viz_" + dnaFilter;

    var args = [];
    args["args"] = [];
    args["op"] = "liveapps.permissioncheck";
    args["args"]["user-id"] = socket.viz_userId;
    args["args"]["liveapp-id"] = data.appId;
    args["args"]["livespace-id"] = data.lid;

    var web_service_domain = WEB_DOMAIN;
    if (data.web_domain)
      web_service_domain = "https://" + data.web_domain + "/sys/api.v2";

    request(
      {
        url: web_service_domain,
        method: "POST",
        form: args,
      },
      function (error, response, body) {
        if (error) log.error("app.permissioncheck post error:::".red, error);
        if (!error && body) {
          try {
            body = JSON.parse(body);
          } catch (e) {
            log.error("app.permissioncheck parse error:::".red, e);
          }
          if (body.Body) {
            socket.leave(
              Object.keys(socket.rooms).filter(
                (item) => item.indexOf("_viz_") > -1
              ),
              function () {
                socket.join(groupName, function () {
                  socket.viz_app = groupName;
                  log.info("ADDED TO APP GROUP:::".green, groupName);
                });
              }
            );
          }
        }
      }
    );
  });

  socket.on("htmlcard_app_switch", function (data) {
    log.info("htmlcard_app_switch:::".green, data);
    var groupName = data.tid + "_viz_" + data.appId;

    var dnaFilter = data.dnaFilter[0];
    if (dnaFilter) groupName = groupName + "_viz_" + dnaFilter;

    var args = [];
    args["args"] = [];
    args["op"] = "liveapps.permissioncheck";
    args["args"]["user-id"] = socket.viz_userId;
    args["args"]["liveapp-id"] = data.appId;
    args["args"]["livespace-id"] = data.lid;

    var web_service_domain = WEB_DOMAIN;
    if (data.web_domain)
      web_service_domain = "https://" + data.web_domain + "/sys/api.v2";
    log.info("web_service_domain:::".green, web_service_domain);
    request(
      {
        url: web_service_domain,
        method: "POST",
        form: args,
      },
      function (error, response, body) {
        if (error) log.error("app.permissioncheck post error:::".red, error);
        if (!error && body) {
          try {
            body = JSON.parse(body);
          } catch (e) {
            log.error("app.permissioncheck parse error:::".red, e);
          }
          if (body.Body) {
            socket.join(groupName, function () {
              socket.viz_app = groupName;
              log.info("ADDED TO APP GROUP FROM HTMLCARD:::".green, groupName);
            });
          }
        }
      }
    );
  });

  // socket.on("ss_dataChange", function(data) {
  //   log.info("ss_dataChange:::".green, data);
  //   var groupName = data.tid + "_" + data.lid;
  //   io.to(groupName).emit("ss_dataChange", data);
  // });
  //
  socket.on("lsEdit-lock", function (data) {
    log.info("lsEdit-lock:::".green, data);
    var ioTag =
      "lsLockUser-" + data.lsShortCode + "-" + socket.viz_tid + "-" + data.type;
    io.of("/").adapter.customRequest(ioTag, function (err, replies) {
      if (err) log.error(`io.of.ioTag::${ioTag}::`.red, err);

      var lockUser = replies.filter(Boolean);
      lockUser = Array.prototype.concat(...lockUser);
      if (lockUser.length) {
        if (lockUser[0].userid == socket.viz_userId)
          socket[`ls_edit_${data.type}`] = data.lsShortCode;
        io.in(`${socket.viz_userId}user`).emit(
          "lsEdit-lock",
          Object.assign(
            { user: lockUser, lsShortCode: data.lsShortCode, type: data.type },
            data.lock && { status: "failure" }
          )
        );
      } else {
        var userArr = [
          {
            username: socket.viz_username,
            userid: socket.viz_userId,
            tid: socket.viz_tid,
          },
        ];
        if (data.lock) {
          io.in(`${socket.viz_userId}user`).emit(
            "lsEdit-lock",
            Object.assign(
              {
                user: userArr,
                lsShortCode: data.lsShortCode,
                type: data.type,
              },
              data.lock && { status: "success" }
            )
          );
          socket.to(`${socket.viz_tid}general`).emit("lsEdit-lock", {
            user: userArr,
            lsShortCode: data.lsShortCode,
            type: data.type,
          });
          socket[`ls_edit_${data.type}`] = data.lsShortCode;
        } else {
          socket.emit("lsEdit-lock", {
            user: [],
            lsShortCode: data.lsShortCode,
            type: data.type,
          });
        }
      }
    });
  });

  socket.on("lsEdit-unlock", function (data) {
    log.info("lsEdit-unlock:::".green, data);
    var lsShortCode = data.lsShortCode;
    var ioTag = `lsUnlockUser-${lsShortCode}-${socket.viz_tid}-${data.type}-${socket.viz_userId}`;
    io.of("/").adapter.customRequest(ioTag, function (err, replies) {
      if (err) log.error(`io.of.ioTag:::${ioTag}::`.red, err);
      var lockUser = replies.filter(Boolean);
      lockUser = Array.prototype.concat(...lockUser);
      if (lockUser.length) {
        io.in(`${socket.viz_tid}general`).emit("lsEdit-unlock", {
          status: "success",
          lsShortCode: data.lsShortCode,
          type: data.type,
        });
      }
    });
  });

  socket.on("wf-lock", function (data) {
    log.info("wf-lock:::".green, data);
    var ioTag = "wfLockUser-" + data.wfid + "-" + socket.viz_tid;
    io.of("/").adapter.customRequest(ioTag, function (err, replies) {
      if (err) log.error(`io.of.ioTag::${ioTag}::`.red, err);

      var lockUser = replies.filter(Boolean);
      lockUser = Array.prototype.concat(...lockUser);
      if (lockUser.length) {
        if (lockUser[0].userid == socket.viz_userId) socket.wf_edit = data.wfid;
        io.in(`${socket.viz_userId}user`).emit(
          "wf-lock",
          Object.assign(
            { user: lockUser, wfid: data.wfid },
            data.lock && { status: "failure" }
          )
        );
      } else {
        var userArr = [
          {
            username: socket.viz_username,
            userid: socket.viz_userId,
            tid: socket.viz_tid,
          },
        ];
        if (data.lock) {
          io.in(`${socket.viz_userId}user`).emit(
            "wf-lock",
            Object.assign(
              {
                user: userArr,
                wfid: data.wfid,
              },
              data.lock && { status: "success" }
            )
          );
          socket.to(`${socket.viz_tid}general`).emit("wf-lock", {
            user: userArr,
            wfid: data.wfid,
          });
          socket.wf_edit = data.wfid;
        } else {
          socket.emit("wf-lock", {
            user: [],
            wfid: data.wfid,
          });
        }
      }
    });
  });

  socket.on("wf-unlock", function (data) {
    log.info("wf-unlock:::".green, data);
    var wfid = data.wfid;
    var ioTag = `wfUnlockUser-${data.wfid}-${socket.viz_tid}-${socket.viz_userId}`;
    io.of("/").adapter.customRequest(ioTag, function (err, replies) {
      if (err) log.error(`io.of.ioTag:::${ioTag}::`.red, err);
      var lockUser = replies.filter(Boolean);
      lockUser = Array.prototype.concat(...lockUser);
      if (lockUser.length) {
        io.in(`${socket.viz_tid}general`).emit("wf-unlock", {
          status: "success",
          wfid: data.wfid,
        });
      }
    });
  });
};
