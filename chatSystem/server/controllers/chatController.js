"use strict";

const fs = require("fs");
const sanitizeHtml = require("sanitize-html");
const _ = require("lodash");
const isJSON = function (str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};
module.exports = function (socket, io, colors, handlerObj, log, request) {
  var sendToAdmins = function (tid, msgTag, data) {
    var room = "Admin" + tid;
    io.to(room).emit(msgTag, data);
  };

  var getOnlineUsers = function (tid) {
    var onlineUsers = [];
    var tidRoom = tid + "general";
    if (io.sockets.adapter.rooms[tidRoom]) {
      var clients = io.sockets.adapter.rooms[tidRoom].sockets;
      for (var sid in clients) {
        var fetch_socket = io.sockets.sockets[sid];

        if (
          onlineUsers.some((obj) => obj.email === fetch_socket.viz_email) ==
          false
        ) {
          onlineUsers.push({
            user: fetch_socket.viz_userId,
            username: fetch_socket.viz_username,
            email: fetch_socket.viz_email,
          });
        }
      }
    }
    return onlineUsers;
  };

  var sendToUser = function (tid, userType, guid, emitTag, data) {
    var room = userType == "Admin" ? "Admin" + tid : tid;
    if (io.sockets.adapter.rooms[room]) {
      var clients = io.sockets.adapter.rooms[room].sockets;
      for (var sid in clients) {
        var fetch_socket = io.sockets.sockets[sid];
        if (
          typeof fetch_socket !== "undefined" &&
          typeof fetch_socket.username !== "undefined"
        ) {
          if (fetch_socket.guid == guid) {
            var socket = fetch_socket;
            socket.emit(emitTag, data);
          }
        }
      }
    }
  };

  var getHandler = function (guestID, workflowId, tid, cb) {
    //console.log(colors.blue("guestID:", guestID, " workflowName:", workflowName));
    io.of("/").adapter.customRequest("gethandlerObj", function (err, replies) {
      if (err) log.error("io.of.gethandlerObj:::", err);
      replies = _.merge(...replies);
      log.debug("replies::::::".green, replies);
      var globalHandlerObj = replies;
      if (
        globalHandlerObj[tid] &&
        globalHandlerObj[tid].hasOwnProperty(guestID)
      ) {
        if (globalHandlerObj[tid][guestID].hasOwnProperty(workflowId)) {
          if (
            typeof globalHandlerObj[tid][guestID][workflowId].adminId !=
            "undefined"
          ) {
            var handler = {};
            handler.id = globalHandlerObj[tid][guestID][workflowId].adminId;
            handler.name = globalHandlerObj[tid][guestID][workflowId].adminName;
            cb(handler);
          } else {
            cb(0);
          }
        } else {
          cb(0);
        }
      } else {
        cb(0);
      }
    });
  };

  var removeHandler = function (sObj) {
    var tid = sObj.adminTid;
    var adminID = sObj.adminId;
    io.of("/").adapter.customRequest(
      `removeHandler-${tid}-${adminID}`,
      function (err, replies) {
        if (err) log.error(`io.of.removeHandler-${tid}-${adminID}:::::`, err);
        var allGuid = replies.filter(Boolean);
        allGuid = Array.prototype.concat(...allGuid);
        for (var ids of allGuid) {
          if (adminID == ids.adminId)
            triggerWorkflow_Func(
              {
                from: sObj.adminEmail,
                guid: ids.guid,
                workflowId: ids.workflowId,
                Body: "/admin_disconnect",
                domain: sObj.workflowDomain,
                tid: sObj.adminTid,
                userId: sObj.adminId,
              },
              sObj
            );
        }
      }
    );
  };

  var getParamsForAdmin = function (data, socket, author) {
    data.guid = socket.guid;
    data.workflowId = socket.workflowId;
    data.author = author;
    return data;
  };

  var logSave_Func = function (opt) {
    var args = [];
    args["args"] = [];
    args["op"] = "realtime.real";
    args["domian"] = opt.data.logdomain;
    args["args"]["user-id"] = opt.data.userId || opt.data.adminId;
    args["args"]["params"] = [];
    args["args"]["params"]["action"] = opt.action;
    // args["args"]["params"]["limit"] = "50";
    args["args"]["params"]["to"] = opt.to;
    args["args"]["params"]["from"] = opt.from;
    args["args"]["params"]["agent"] = opt.agent;
    if (opt.data.device) args["args"]["params"]["device"] = opt.data.device;
    if (opt.message) args["args"]["params"]["body"] = opt.message;
    if (opt.workflow_log_id)
      args["args"]["params"]["workflow_log_id"] = opt.workflow_log_id;
    if (opt.username) args["args"]["params"]["username"] = opt.username;
    opt.data.logdomain =
      opt.data.logdomain === "127.0.0.1" ? "receiver-web" : opt.data.logdomain;
    var logurl = "https://" + opt.data.logdomain + "/sys/api.v2";
    return new Promise(function (resolve, reject) {
      if (typeof opt.saveLogs == "undefined" || opt.saveLogs) {
        request.post(
          {
            url: logurl,
            method: "POST",
            form: args,
          },
          function (error, response, body) {
            if (error) reject(error);
            else resolve(body);
          }
        );
      } else reject("saveLogs false");
    });
  };

  var triggerWorkflow_Func = function (data, socket, formData) {
    if (typeof socket !== "undefined" && socket.headerToken)
      data.headerToken = socket.headerToken;
    var hashtoken = socket.hashtoken ? socket.hashtoken : "";
    data.domain = data.domain === "127.0.0.1" ? "receiver-web" : data.domain;
    var url = "https://" + data.domain + "/workflow.trigger/" + data.workflowId;
    var form = formData ? "formData" : "form";
    var reqObj = {
      url: url,
      method: "POST",
    };
    reqObj.headers = {
      hashtoken: hashtoken ? hashtoken : undefined,
      auth_token: socket.auth_token ? socket.auth_token : undefined,
      refresh_token: socket.refresh_token ? socket.refresh_token : undefined,
    };
    if (data.data && isJSON(data.data)) {
      var dataObj = JSON.parse(data.data);
      Object.keys(dataObj).map(function (key, index) {
        data[key] = _.isArray(dataObj[key])
          ? dataObj[key].join()
          : dataObj[key];
      });
    }
    reqObj[form] = data;
    return new Promise(function (resolve, reject) {
      request.post(reqObj, function (error, response, body) {
        if (error) reject(error);
        else {
          body = safelyParseJSON(body);
          // log.debug("trigger-response:::",body);
          if (!Array.isArray(body) && typeof body === "object") {
            log.error(
              `WF TRIGGER RESPONSE ERROR:hastoken:${reqObj.headers.hashtoken}::${body}`
            );
            reject("Trigger Response Error");
            return;
          }
          if (body.includes("Internal Server Error")) {
            socket.emit("invalid_token", socket.auth_token);
          }
          if (Array.isArray(body)) {
            if (checkMsgValid(body[0].Body)) resolve(body[0]);
            else reject("Response Body Not Valid:::" + body[0].Body);
          } else reject("Response Not Array:::" + body);
        }
      });
    });
  };

  var checkMsgValid = function (msg) {
    var speclMsg = ["/error", "/stop", "/timeout", "/reopen"];
    if (speclMsg.includes(msg) || msg === "undefined") return false;
    else return true;
  };

  var safelyParseJSON = function (body) {
    var parsed;
    body = body.trim();
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      log.error(
        colors.red("PARSING ERROR:::(json)-->" + body + "::(err)-->", e)
      );
      return body;
    }
    return parsed;
  };

  var deleteUploadFile = function (filename) {
    fs.unlink(
      __dirname + "/../../public/fileUpload/" + filename,
      function (err) {
        if (err) log.error("file not deleted:::".red, err);
        // else console.log("file deleted successfully");
      }
    );
  };

  var sendToTenantUsers = function (tid, msgTag, data) {
    var room = tid + "general";
    io.to(room).emit(msgTag, data);
  };

  socket.on("vizru_user", function (data) {
    log.info("vizru_user:::".green, data);
    this.viz_username = data.username;
    this.viz_userId = data.id;
    this.viz_tid = data.tid;
    this.viz_email = data.email;
    socket.join(data.tid + "general");
    socket.join(data.id + "user");
    var onlineUsers = getOnlineUsers(data.tid);
    sendToTenantUsers(data.tid, "get_active_userlist", onlineUsers);
  });

  socket.on("set_admin", function (data) {
    log.info("admin connected:::".green, data);
    this.username = "Admin";
    this.adminId = data.adminId;
    this.adminName = data.adminName;
    this.adminTid = data.tid;
    this.adminEmail = data.adminEmail;
    this.workflowDomain = data.domain;
    this.hashtoken = data.hashtoken;
    var adminRoomName = "Admin" + data.tid;
    socket.join(adminRoomName);
    var onlineUsers = getOnlineUsers(data.tid);
    this.emit("online_users", onlineUsers);
    this.emit("handlerObj", handlerObj[data.tid]);
  });

  socket.on("set_user", function (data) {
    if (data.user == "Guest") {
      this.username = data.user;
      this.guid = data.guid;
      this.tid = data.tid;
      this.workflowDomain = data.domain;
      this.workflowId = data.workflowId;
      this.connectedWorkflow = data.connectedWorkflow;
      this.saveLogs = data.saveLogs;
      this.device = data.device;
      this.logdomain = data.logdomain;
      this.apiUserId = data.apiUserId;
      this.hashtoken = data.hashtoken;
      this.refresh_token = data.refresh_token;
      this.auth_token = data.auth_token;
      this.userEmail = data.userEmail;
      this.toUserEmail = data.toUserEmail;
      this.vizuserName = data.vizuserName;
      this.Agent = data.Agent;
      if (data.headerToken) this.headerToken = data.headerToken;
      this.join(data.tid);
      //var wrkflwname = Object.keys(data.connectedWorkflow)[0];
      if (!handlerObj.hasOwnProperty(data.tid)) handlerObj[data.tid] = {};
      handlerObj[data.tid][data.guid] = {};
      handlerObj[data.tid][data.guid][data.workflowId] = "";
      this.join(data.guid);
      log.info("guest user connected:::".green, data);
      var onlineUsers = getOnlineUsers(data.tid);
      sendToAdmins(data.tid, "online_users", onlineUsers);
    }
  });

  // Get workflowLogs
  socket.on("get_flowmessages", function (data) {
    log.info("get_flowmessages:::".green, data);
    logSave_Func({
      data: data,
      action: "get",
      to: data.to,
      from: data.from,
      message: "",
      agent: "guest_mode",
    }).then(
      function (result) {
        if (result) result = safelyParseJSON(result);
        if (Array.isArray(result.Body)) {
          result.Body.length
            ? log.info(`<:::Fetched  ${result.Body.length} logs:::>`.green)
            : log.info("<:::No previous messages:::>".green);
        }
        socket.emit("get_flowmessages", result.Body);
      },
      function (err) {
        log.error("get_flowmessages fetch error:::".red, err);
      }
    );
  });

  socket.on("resend_msg", function (data) {
    data = _.merge(data.Body, {
      Body: data.Body.Body,
      tid: data.tid,
      device: socket.device,
      logdomain: socket.logdomain,
      userId: socket.apiUserId,
    });
    log.info("resend_msg:::".green, data);
    if (data.Body) {
      if (data.broadcast !== "true") socket.emit("new_message", data);
      else {
        socket.to(socket.guid).emit("new_message", {
          Body: data.Body,
          username: data.userName,
        });
      }
      var admindata = getParamsForAdmin(data, socket, "workflow");
      sendToAdmins(data.tid, "realtime_msg", admindata);
      if (typeof data.broadcast === "undefined") {
        logSave_Func({
          data: data,
          action: "post",
          to: data.broadcast ? socket.workflowId : socket.guid,
          from: data.broadcast ? socket.guid : socket.workflowId,
          username: data.userName,
          message: data.Body,
          agent: "workflow_mode",
          saveLogs: socket.saveLogs,
          workflow_log_id: data.workflow_log_id,
        }).then(
          function (result) {
            // log.info("workflow ==> user log saved:::".green);
          },
          function (err) {
            log.error("workflow ==> user log save error:::".red, err);
          }
        );
      }
    }
  });

  socket.on("sent_file", function (data) {
    if (data.Body == "/file") {
      socket.emit("file_received", data.filename);
      log.info("fileType:::".green, data.fileType);

      var filename = data.filename;

      let base64String = data.fileRaw.split(",").pop();

      fs.writeFile(
        __dirname + "/../../public/fileUpload/" + filename,
        base64String,
        {
          encoding: "base64",
        },
        function (err) {
          if (err) {
            log.error("file creation error:::".red, err);
            socket.emit("new_message", {
              Body: "There was an error in uploading your file. Please try again",
            });
          } else {
            log.info("File created:::".green);
            data.file = fs.createReadStream(
              __dirname + "/../../public/fileUpload/" + filename
            );

            triggerWorkflow_Func(data, socket, "formData").then(
              function (result) {
                log.info(
                  "Upload successful! Server responded with:::".green,
                  result
                );
                socket.emit("new_message", result);
                var admindata = getParamsForAdmin(data, socket, "guest");
                sendToAdmins(data.tid, "file_sent", admindata);
                var admindata2 = getParamsForAdmin(result, socket, "workflow");
                sendToAdmins(data.tid, "realtime_msg", admindata2);
                deleteUploadFile(filename);
              },
              function (err) {
                if (
                  typeof err === "string" &&
                  err.indexOf("Response Body Not Valid") == -1
                )
                  socket.emit("new_message", {
                    Body: "There was an error in uploading your file. Please try again",
                  });
                else if (err.indexOf("Response Body Not Valid") > -1) {
                  var admindataOnNULL = getParamsForAdmin(
                    data,
                    socket,
                    "guest"
                  );
                  sendToAdmins(data.tid, "file_sent", admindataOnNULL);
                }
                deleteUploadFile(filename);
              }
            );
          }
        }
      );
    }
  });

  socket.on("workflow_trigger", function (data) {
    data.Body =
      data.Body.indexOf("<script>") > -1 ? sanitizeHtml(data.Body) : data.Body;
    if (data.Body == "") {
      socket.emit("new_message", {
        Body: "That was a invalid message",
      });
    } else {
      var clientSocket = this;
      var admindata = getParamsForAdmin(data, socket, "guest");
      log.info("workflow_trigger:::".green, data);
      if (data.Body == "/help") {
        sendToAdmins(data.tid, "panicked", { guid: data.from });
        if (handlerObj[data.tid][data.from][data.workflowId] == "")
          handlerObj[data.tid][data.from][data.workflowId] = "panicked";
      } else sendToAdmins(data.tid, "realtime_msg", admindata);
      clientSocket.emit("showTyping", {});
      if (checkMsgValid(data.Body) && data.broadcast !== "false") {
        logSave_Func({
          data: data,
          action: "post",
          to: data.workflowId,
          from: data.from,
          message: data.Body,
          agent: "guest_mode",
          username: data.userName,
          saveLogs: socket.saveLogs,
        }).then(
          function (result) {
            // log.info("user ==> workflow log saved:::".green);
          },
          function (err) {
            log.error("user ==> workflow log save error:::".red, err);
          }
        );
      }

      triggerWorkflow_Func(data, socket).then(
        function (result) {
          log.info("workflow ==> user workflow res:::".green, result);
          if (result.pk) socket.pkNo = result.pk;
          if (result.broadcast === "true" && data.toUserEmail) {
            socket.to(data.from).emit("new_message", result);
          } else {
            socket.emit("new_message", result);
          }
          if (result.broadcast === "true" && result.sender === "true") {
            socket.emit("new_message", result);
          }
          if (
            data.Body.charAt(0) != "/" &&
            result.systemMessage !== "true" &&
            result.broadcast !== "false" &&
            result.prevMsg !== "false"
          ) {
            socket.to(data.from).emit("new_message", {
              Body: data.Body,
              username: data.userName,
            });
          }
          var admindata = getParamsForAdmin(result, socket, "workflow");
          sendToAdmins(data.tid, "realtime_msg", admindata);
          if (
            result.Body != "/null" &&
            result.systemMessage !== "true" &&
            result.card !== "upload-card" &&
            (typeof result.broadcast === "undefined" ||
              result.broadcast === "true")
          ) {
            logSave_Func({
              data: data,
              action: "post",
              to: data.from,
              from: data.workflowId,
              message: result.Body,
              agent: "workflow_mode",
              saveLogs: socket.saveLogs,
              workflow_log_id: result.workflow_log_id,
            }).then(
              function (result) {
                // log.info("workflow ==> user log saved:::".green);
              },
              function (err) {
                log.error("workflow ==> user log save error:::".red, err);
              }
            );
          }
        },
        function (err) {
          socket.to(data.from).emit("new_message", {
            Body: "",
          });
          log.error("user ==> workflow trigger error:::".red, err);
        }
      );
    }
  });

  socket.on("admin_msg", function (data) {
    data.Body =
      data.Body.indexOf("<script>") > -1 ? sanitizeHtml(data.Body) : data.Body;
    if (data.Body == "") {
      socket.emit("special_msg", "Invalid Message");
    } else {
      log.info("admin msg:::".green, data);
      var GuestId = data.to;
      var adminMsg = data.Body;
      var workflowId = data.workflowId;
      var adminSocket = this;
      var adminRoom = "Admin" + data.tid;
      var adminID = data.adminId;
      var tid = data.tid;
      getHandler(GuestId, workflowId, tid, function (handlerDetails) {
        var handlerFetch = handlerDetails;
        var spclMsg = "";
        var msgValid = true;

        if (handlerFetch == 0) {
          if (adminMsg == "/pause") {
            handlerObj[tid][GuestId] = {};
            handlerObj[tid][GuestId][workflowId] = {
              adminId: data.adminId,
              adminName: data.adminName,
            };
            sendToAdmins(tid, "broadcast_handlerSet", {
              guid: GuestId,
              admin: data.adminName,
            });
          } else {
            spclMsg = "type /pause to interact";
            adminSocket.emit("special_msg", spclMsg);
            msgValid = false;
          }
        } else {
          if (handlerFetch.id == adminID && adminMsg == "/resume") {
            handlerObj[tid][GuestId][workflowId] = "";
            sendToAdmins(tid, "broadcast_handlerRemove", { guid: GuestId });
          } else if (handlerFetch.id == adminID && adminMsg != "/resume") {
            // log.info("message:::".green, adminMsg);
          } else {
            spclMsg = "guest handeled by " + handlerFetch.name;
            adminSocket.emit("special_msg", spclMsg);
            msgValid = false;
          }
        }

        if (msgValid) {
          var admindata = {
            Body: data.Body,
            workflowId: data.workflowId,
            guid: GuestId,
          };
          admindata = getParamsForAdmin(data, admindata, "admin");
          adminSocket.broadcast.to(adminRoom).emit("realtime_msg", admindata);

          if (adminMsg.charAt(0) != "/")
            sendToUser(data.tid, "Guest", data.to, "new_message", data);

          logSave_Func({
            data: data,
            action: "post",
            to: data.to,
            from: data.workflowId,
            message: data.Body,
            agent: "Admin",
          }).then(
            function (result) {
              // log.info("admin ==> user log saved:::".green);
            },
            function (err) {
              log.error("admin ==> user log save error:::".red, err);
            }
          );

          triggerWorkflow_Func(data, adminSocket).then(
            function (result) {
              log.info("admin ==> user workflow res:::".green, result);
              var admindata = getParamsForAdmin(
                result,
                { workflowId: data.workflowId, guid: GuestId },
                "workflow"
              );
              sendToAdmins(tid, "realtime_msg", admindata);
              sendToUser(data.tid, "Guest", data.to, "new_message", result);
              logSave_Func({
                data: data,
                action: "post",
                to: data.to,
                from: data.workflowId,
                message: result.Body,
                agent: "workflow_mode",
              }).then(
                function (result) {
                  // log.info("admin ==> wrkflow ==> user log saved:::".green);
                },
                function (err) {
                  log.error(
                    "admin ==> wrkflow ==> user log save error:::".red,
                    err
                  );
                }
              );
            },
            function (err) {
              log.error("admin msg ==> workflow trigger error:::".red, err);
            }
          );
        }
      });
    }
  });

  socket.on("task_card_trigger", function (data) {
    triggerWorkflow_Func(data, socket).then(
      function (result) {
        socket.emit("task_card_trigger", result);
      },
      function (err) {}
    );
  });

  socket.on("sent_to_guid", function (data) {
    var admindata = getParamsForAdmin(
      data.Body,
      { workflowId: data.workflowId, guid: data.guid },
      "workflow"
    );
    sendToUser(data.tid, "Guest", data.guid, "new_message", data.Body);
    sendToAdmins(data.tid, "realtime_msg", admindata);
  });

  socket.on("disconnect", function (reason) {
    var onlineUsers = getOnlineUsers(this.viz_tid);
    sendToTenantUsers(this.viz_tid, "get_active_userlist", onlineUsers);
    if (socket.wf_edit) {
      io.in(`${socket.viz_tid}general`).emit("wf-unlock", {
        status: "success",
        wfid: socket.wf_edit,
      });
    }
    if (this.username !== "Admin") {
      log.info("Guest disconnected:::".red, reason);
      if (handlerObj[this.tid]) {
        delete handlerObj[this.tid][this.guid];
      }
      var data = {
        from: this.guid,
        userName: this.vizuserName,
        workflowId: this.workflowId,
        Body: "/disconnect",
        domain: this.workflowDomain,
        device: this.device,
        userEmail: this.userEmail,
        toUserEmail: this.toUserEmail,
        tid: this.tid,
        Agent: this.Agent,
        logdomain: this.logdomain,
        userId: this.apiUserId,
        guid: this.guid,
        executed_from: "chat",
      };
      triggerWorkflow_Func(data, socket).then(
        function (result) {},
        function (err) {}
      );
      sendToAdmins(this.tid, "userDisconnected", this.guid);
    }
    if (this.username == "Admin") {
      log.info("admin disconnected:::".red, reason);
      removeHandler(this);
    }
  });

  // Get workflowLogs
  socket.on("get_active_userlist", function (data) {
    if (data && data.tid) {
      var onlineUsers = getOnlineUsers(data.tid);
      socket.emit("get_active_userlist", onlineUsers);
    }
  });
};
