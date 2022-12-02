const express = require("express");
const router = express.Router();
const path = require("path");
const chalk = require("chalk");
const urlmod = require("url");
const querystring = require("querystring");
const _ = require("lodash");
const parse = require("url-parse");

const log = require("../server/config/log");
const defaultViewPortWidth =
  require("../server/config/config").defaultViewPortWidth;
const defaultViewPortHeight =
  require("../server/config/config").defaultViewPortHeight;

const getFilePath =
  require("../server/controllers/customFunctions").getFilePath;

function RemoveParameterFromUrl(url, parameter) {
  return url
    .replace(new RegExp("[?&]" + parameter + "=[^&#]*(#.*)?$"), "$1")
    .replace(new RegExp("([?&])" + parameter + "=[^&]*&"), "$1");
}

/* GET /generate */
router.post("/", async (req, res, next) => {
  let pdfQueue = req.pdfQueue;
  let url = decodeURIComponent(req.query.url);
  let fileUrls = req.body.fileUrls
    ? req.body.fileUrls.split(",")
    : req.query.fileUrls
    ? req.query.fileUrls.split(",")
    : [];
  let uploadUrl = req.body.uploadUrl || req.query.uploadUrl;
  let parsedUrl = urlmod.parse(url);
  let parsedQs = querystring.parse(parsedUrl.query);
  let {
    token = req.query.token || "",
    watermark = req.query.watermark || false,
    crid = req.query.crid || false,
    download = req.query.download || "browser",
    removeEmptyPages = req.query.removeEmptyPages || true,
    autoPageNumber = req.query.autoPageNumber || false,
    filename = req.query.filename || req.body.filename || Date.now().toString(),
    landscape = req.query.landscape || true,
    viewPortWidth = req.query.viewPortWidth || defaultViewPortWidth,
    viewPortHeight = req.query.viewPortHeight || defaultViewPortHeight,
    jobid = req.query.jobid || req.body.jobid || "",
    UID = req.query.UID || req.body.UID || "",
    returnData = req.body.data || req.body.progressbar || "",
    headerTemplate = req.body.headerTemplate || undefined,
    footerTemplate = req.body.footerTemplate || undefined,
    marginTop = req.body.marginTop || undefined,
    marginBottom = req.body.marginBottom || undefined,
    marginLeft = req.body.marginLeft || undefined,
    marginRight = req.body.marginRight || undefined,
  } = parsedQs;

  filename = filename.split(".").pop() === "pdf" ? filename : filename + ".pdf";
  // filename = path.join(__dirname, `../public/pdf-files/${filename}`);
  uploadUrl = uploadUrl ? uploadUrl : req.query.uploadUrl || false;
  download = String(download).trim() === "false" ? false : download;
  autoPageNumber = String(autoPageNumber).trim() === "true" ? true : false;
  watermark = String(watermark).trim() === "false" ? false : watermark;
  removeEmptyPages = String(removeEmptyPages).trim() === "true" ? true : false;

  if (!url) {
    log.error("URL not specified");
    res.send({ error: "URL not specified" });
  } else {
    url = url.indexOf("://") === -1 ? "http://" + url : url;
    url = RemoveParameterFromUrl(url,"watermark");
    url = RemoveParameterFromUrl(url,"uploadUrl");
    url = RemoveParameterFromUrl(url,"jobid");
    url = RemoveParameterFromUrl(url,"token");
    url = token ? `${url}&token=${token}` : url;
    let parsed = parse(url);
    if (parsed.hostname === "127.0.0.1") {
      parsed.set("hostname", "receiver-web");
      url = parsed.toString();
    }
    crid =
      url.indexOf("/CRID/") !== -1
        ? "crid_" + url.split("/CRID/").pop().split("?_ls")[0]
        : "crid_";
    let dashboardType = crid !== "crid_" ? "mfin" : "vizru";
    let dataObj = {
      url,
      fileUrls,
      watermark,
      crid,
      dashboardType,
      uploadUrl,
      download,
      removeEmptyPages,
      autoPageNumber,
      filename,
      landscape,
      viewPortWidth,
      viewPortHeight,
      jobid,
      UID,
      returnData,
      headerTemplate,
      footerTemplate,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
    };
    log.info(chalk.green("REQUEST URL:::"), dataObj.url);

    pdfQueue
      .add(dataObj, { removeOnComplete: true, removeOnFail: true })
      .then(async function (job) {
        log.info(chalk.green(`Job ${job.id} has been created`));
        res.queueId = job.id;
        if (dashboardType === "mfin" || uploadUrl) {
          download = false;
          res.status(200).json({ jobid: job.id });
        } else {
          await job.finished();
          if (!download) res.send(null);
          else if (download === "browser") {
            log.debug("sentFile");
            res.sendFile(getFilePath(filename));
          } else {
            res.download(filename);
          }
        }
      });
  }
});

module.exports = router;
