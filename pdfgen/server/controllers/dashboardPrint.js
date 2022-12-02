const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const _ = require("lodash");
const log = require("../config/log");
const _pdfLib = require("pdf-lib");
const PDFDocument = _pdfLib.PDFDocument;
const DEBUG_MODE = require("../config/config").debug_mode;
const watermarkFunc = require("./customFunctions").watermarkFunc;
const mergePdf = require("./customFunctions").mergePdf;
const findEmptyPages = require("./customFunctions").findEmptyPages;
// const addCustomPageNo = require("./customFunctions").addCustomPageNo;
const deleteFile = require("./customFunctions").deleteFile;
const setContentPageNumbers =
  require("./mfinCustomFunctions").setContentPageNumbers;
const setHeightOfWidgets = require("./pageFunctions").setHeightOfWidgets;
const getFilePath = require("./customFunctions").getFilePath;
const checkDomain = require("./pageFunctions").checkDomain;
const printTabPage = require("./pageFunctions").printTabPage;
const changePolicyOrder = require("./mfinCustomFunctions").changePolicyOrder;

let startGeneration = async (postData) => {
  let {
    dashboardType,
    viewPortWidth,
    viewPortHeight,
    url,
    landscape,
    filename,
    autoPageNumber,
  } = postData;
  postData.watermark = postData.watermark ? postData.watermark.toString() : "";
  postData.fileData = {};
  postData.fileData.tabData = [];
  postData.fileData.pdfFiles = [];
  postData.fileData.pdfFileName = "";
  postData.fileData.leftMargin = "";
  let fileData = postData.fileData;

  let browser;
  let beginTime = Date.now();
  return await new Promise(async (resolve, reject) => {
    try {
      var processTimeout = setTimeout(() => {
        exitProcess(501, true);
      }, 7 * 60000); // 7 minutes

      browser = await puppeteer.launch({
        headless: DEBUG_MODE ? false : true,
        slowMo: DEBUG_MODE ? 1000 : undefined,
        ignoreHTTPSErrors: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          "--disable-gpu",
          "--disable-web-security",
          "-webkit-print-color-adjust",
        ],
      });
      const page = await browser.newPage();
      await page.setViewport({
        width: viewPortWidth,
        height: viewPortHeight - 350,
      });

      await page.goto(url, {
        waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"], //navigation is considered to be successful after all events have been fired
        timeout: 3 * 60000, // 3 minutes
      });
      page.on("console", (consoleObj) =>
        log.debug("FROM PAGE:::", consoleObj.text())
      );
      await page.emulateMediaType("screen");

      let exitProcess = async (msg, error) => {
        let endTime = Date.now();
        let timeSpent = (endTime - beginTime) / 1000 + "secs";
        log.info(chalk.cyan(`PDF generated in ${timeSpent}`));
        if (!DEBUG_MODE) await browser.close();
        clearTimeout(processTimeout);
        if (error) reject(msg);
        else resolve(msg);
      };

      postData.domain = await checkDomain(page);
      let domain = postData.domain;
      log.info("viz_domain:::", domain.viz_domain, "::tabs::", domain.tabs);

      if (domain.viz_domain && url.includes("general.dashboard")) {
        const watchDog = page.waitForFunction(
          'gridster !== "undefined" && Object.keys(gridster).length != 0'
        );
        await watchDog;
      }

      if (domain.$page) {
        const watchDog2 = page.waitForFunction(
          'typeof botStudio !== "undefined" && botStudio.done === true'
        );
        await watchDog2;
        await page.evaluate(async () => {
          await Promise.all(
            $page.waitForPromises.map(async (element) => await element())
          );
          $page.waitForPromises = [];
        });
      }

      if (domain.viz_domain && dashboardType === "mfin")
        await changePolicyOrder(page);

      let i = 0;
      do {
        fileData.tabData.push(await setHeightOfWidgets(page, postData, i));
        i++;
      } while (i < domain.tabs);

      if (dashboardType === "mfin") {
        await setContentPageNumbers(page, postData);
      }

      i = 0;
      do {
        await printTabPage(page, postData, i);
        i++;
      } while (i < domain.tabs);

      if (!DEBUG_MODE) {
        await browser.close();
        if (fileData.pdfFiles.length > 1)
          await mergePdf(fileData.pdfFiles, filename + "_merged.pdf").catch(
            (e) => {
              log.error("MERGE PDF ERROR::", e);
              exitProcess(502, true);
            }
          );
        else
          fs.renameSync(
            getFilePath(fileData.pdfFiles[0]),
            getFilePath(filename + "_merged.pdf")
          );
        const getFile = (flname, timeoutSeconds) => {
          let filePath = getFilePath(flname);
          let finalFilePath = getFilePath(filename);
          let tries = 0;
          let timeout = setInterval(() => {
            const fileExists = fs.existsSync(filePath);
            log.info("Checking for: ", path.basename(filePath));
            log.info("Exists: ", fileExists);
            if (++tries === 2) {
              log.error("file not found exiting");
              clearInterval(timeout);
              exitProcess(503, true);
            }
            if (fileExists) {
              clearInterval(timeout);
              findEmptyPages(filePath, postData).then(async (result) => {
                const pdfDoc = await PDFDocument.create();
                const srcPdfBytes = fs.readFileSync(filePath);
                const srcPdfDoc = await PDFDocument.load(srcPdfBytes);
                const validPage = await pdfDoc.copyPages(srcPdfDoc, [
                  ...result,
                ]);
                validPage.forEach((pages) => pdfDoc.addPage(pages));
                const pdfBytes = await pdfDoc.save();

                fs.writeFileSync(finalFilePath, pdfBytes);
                log.debug("MERGED TO FINAL FILE");
                await deleteFile(flname);
                // if (autoPageNumber) await addCustomPageNo(postData);
                if (postData.watermark) await watermarkFunc(postData);
                exitProcess("file generated");
              });
            }
          }, timeoutSeconds);
        };
        getFile(filename + "_merged.pdf", 2000);
      } else exitProcess("debug completed");
    } catch (error) {
      log.error(chalk.red(`ERROR CATCH::::${error}`));
      browser ? await browser.close() : null;
      clearTimeout(processTimeout);
      reject(error);
    }
  });
};

module.exports = startGeneration;
