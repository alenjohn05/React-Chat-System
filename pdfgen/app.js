let createError = require("http-errors");
let express = require("express");
let path = require("path");
let cookieParser = require("cookie-parser");
let logger = require("morgan");
const chalk = require("chalk");
const log = require("./server/config/log");
const Queue = require("bull");
const { createBullBoard } = require('bull-board');
const { BullAdapter } = require('bull-board/bullAdapter');
const prettyjson = require("prettyjson");
const { serializeError } = require("serialize-error");
const PrettyError = require("pretty-error");
const pe = new PrettyError();
const uploadFile = require("./server/controllers/upload");
const dashboardPrint = require("./server/controllers/dashboardPrint");
const findRemoveSync = require("find-remove");

const REDIS_URL = require("./server/config/config").redis_url;
const REDIS_PORT = require("./server/config/config").redis_port;
const REDIS_PASSWD = require("./server/config/config").redis_passwd;
const DEBUG_MODE = require("./server/config/config").debug_mode;

const pdfQueue = new Queue("pdf generation", {
  redis: { port: REDIS_PORT, host: REDIS_URL, password: REDIS_PASSWD },
});
const UI = createBullBoard([
  new BullAdapter(pdfQueue),
]).router;

async function clearRedis(queue) {
  await queue.empty();
  await queue.clean(0, "active");
  await queue.clean(0, "completed");
  await queue.clean(0, "delayed");
  await queue.clean(0, "failed");
  log.info(chalk.green("QUEUE CLEARED"));
  return;
}

clearRedis(pdfQueue);

pdfQueue.on("completed", (job, result) => {
  log.info(
    chalk.green(
      `Job ${job.id} completed with result:: ${
        result.error ? chalk.red("ERROR") : result.success
      }`
    )
  );
});

pdfQueue.process(async (job, done) => {
  log.info(chalk.green(`Job ${job.id} started processing`));
  log.info(chalk.green("DATA:::::"));
  console.log(prettyjson.render(job.data));
  findRemoveSync(path.join(__dirname, "/public/pdf-files"), {
    age: { seconds: 1800 },
    extensions: [".pdf"],
  });
  dashboardPrint(job.data)
    .then((msg) => {
      job.data.requestRetry = 3;
      if (
        !DEBUG_MODE &&
        (job.data.dashboardType === "mfin" || job.data.uploadUrl)
      )
        uploadFile({
          data: job.data,
          jobId: job.id,
        });
      done(null, { success: JSON.stringify(msg) });
    })
    .catch((error) => {
      log.error(pe.render(error));
      let error_description, error_code, error_string;
      error = JSON.stringify(serializeError(error));
      if (error.includes("Cannot read property 'startPage' of undefined")) {
        error = 504;
      }
      switch (error) {
        case 501:
          error_description = "Process timeout";
          error_code = "501";
          break;
        case 502:
          error_description = "Merge PDF error";
          error_code = "502";
          break;
        case 503:
          error_description = "File access error";
          error_code = "503";
          break;
        case 504:
          error_description = "Session timeout";
          error_code = "504";
          break;
        default:
          error_description = "ERROR";
          error_code = "500";
          error_string = error;
      }
      if (!DEBUG_MODE)
        uploadFile({
          data: job.data,
          jobId: job.id,
          error_description: error_description,
          error_code: error_code,
          error_string: error_string,
        });
      done(null, { error: error });
    });
});

let indexRouter = require("./routes/index");
let generateRouter = require("./routes/generate");
let watermarkRouter = require("./routes/watermark");

let app = express();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(
  logger("dev", {
    skip: function (req, res) {
      if (req.url.indexOf("/queues") > -1) {
        return true;
      } else {
        return false;
      }
    },
  })
);
app.use(express.json());
app.use(express.urlencoded({ limit: '50mb', extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/health", indexRouter);
app.use(
  "/generate",
  function (req, res, next) {
    req.pdfQueue = pdfQueue;
    next();
  },
  generateRouter
);
app.use("/watermark", watermarkRouter);
app.use("/queues", UI);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
