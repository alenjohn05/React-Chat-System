"use strict";

const chalk = require("chalk");
const moment = require("moment");

function timestamp(type, messageArgs) {
  let format = "YYYY-MM-DD HH:mm:ss";
  let tz = "+05:30";

  let time = moment().utcOffset(tz).format(format);

  Array.prototype.unshift.call(messageArgs, chalk.dim(time), type);

  return messageArgs;
}

exports.error = function () {
  console.error.apply(console, timestamp(chalk.red("[ERROR]"), arguments));
};

exports.warn = function () {
  console.error.apply(console, timestamp(chalk.yellow("[WARN]"), arguments));
};

exports.info = function () {
  console.log.apply(console, timestamp(chalk.blue("[INFO]"), arguments));
};

exports.debug = function () {
  console.log.apply(console, timestamp(chalk.cyan("[DEBUG]"), arguments));
};

exports.raw = function () {
  console.log.apply(console, arguments);
};
