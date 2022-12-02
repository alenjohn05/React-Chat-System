"use strict";

const colors = require("colors");
const moment = require("moment");

function timestamp(type, messageArgs) {
  var format = "YYYY-MM-DD HH:mm:ss";
  var tz = "UTC+00:00";

  var time = moment().utcOffset(tz).format(format);

  Array.prototype.unshift.call(messageArgs, colors.dim(time), type);

  return messageArgs;
}

exports.error = function () {
  console.error.apply(console, timestamp(colors.red("[ERROR]"), arguments));
};

exports.warn = function () {
  console.error.apply(console, timestamp(colors.yellow("[WARN]"), arguments));
};

exports.info = function () {
  console.log.apply(console, timestamp(colors.blue("[INFO]"), arguments));
};

exports.debug = function () {
  console.log.apply(console, timestamp(colors.cyan("[DEBUG]"), arguments));
};

exports.raw = function () {
  console.log.apply(console, arguments);
};
