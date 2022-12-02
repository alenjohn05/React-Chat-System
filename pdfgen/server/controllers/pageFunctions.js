const prettyjson = require("prettyjson");
const chalk = require("chalk");
const log = require("../config/log");
const setMarginOfFooter = require("./mfinCustomFunctions").setMarginOfFooter;
const generatePDF = require("./customFunctions").generatePDF;
const printBenchmarkTbl = require("./mfinCustomFunctions").printBenchmarkTbl;
const printInventoryTbl = require("./mfinCustomFunctions").printInventoryTbl;
const printTOC_Tbl = require("./mfinCustomFunctions").printTOC_Tbl;
const coverPageActions = require("./mfinCustomFunctions").coverPageActions;

let checkDomain = async (p) => {
  const domainData = await p.evaluate(() => {
    return typeof checkDomain === "undefined"
      ? {
          viz_domain: false,
          domRect: JSON.stringify(
            document.querySelector("body").getBoundingClientRect()
          ),
          tabs: 0,
        }
      : checkDomain();
  });
  domainData.domRect = JSON.parse(domainData.domRect);
  return domainData;
};

let setHeightOfWidgets = async (page, postData, tabIndex) => {
  let { viewPortHeight, domain, dashboardType } = postData;
  const heightData = await page.evaluate(
    (domain, viewPortHeight, tabIndex, dashboardType) => {
      return domain.viz_domain
        ? setHeightOfWidgets(domain, viewPortHeight, tabIndex, dashboardType)
        : {
            heightForPages: [],
            pagesToScreenshot: 1,
          };
    },
    domain,
    viewPortHeight,
    tabIndex,
    dashboardType
  );
  return heightData;
};

let printTabPage = async (page, postData, tabIndex) => {
  let { domain, fileData, filename, dashboardType } = postData;
  let pdfFileName;
  let heightData = fileData.tabData[tabIndex];
  console.log("page-data:::", heightData);
  await page.evaluate((tabIndex) => {
    if (typeof $app !== "undefined" && $app.domain) {
      changeTab(tabIndex);
    }
  }, tabIndex);
  for (let i = 0; i < heightData.pagesToScreenshot; i++) {
    var isBenchmarkPage = await page.evaluate(
      (heightData, i, dashboardType) => {
        let event = new CustomEvent("print-pdf", {});
        document.dispatchEvent(event);
        return typeof isBenchmarkPage === "undefined"
          ? false
          : isBenchmarkPage(heightData, i, dashboardType);
      },
      heightData,
      i,
      dashboardType
    );
    await page.waitForTimeout(800);
    if (dashboardType === "mfin" && tabIndex > 0)
      await setMarginOfFooter(page, postData, tabIndex);
    if (dashboardType === "mfin" && tabIndex == 0) {
      await coverPageActions(page);
    }
    if (
      !heightData.hasTable ||
      (!isBenchmarkPage &&
        heightData.tableType != "inventory" &&
        heightData.tableType != "TOC")
    ) {
      pdfFileName = domain.viz_domain
        ? `${filename}_${tabIndex}_${i}.pdf`
        : `${filename}_merged.pdf`;
      fileData.pdfFiles.push(pdfFileName);
      await generatePDF(page, postData);
    } else {
      switch (heightData.tableType) {
        case "benchmark":
          await printBenchmarkTbl(postData, page, tabIndex, i);
          break;
        case "inventory":
          await printInventoryTbl(postData, page, tabIndex, i);
          break;
        case "TOC":
          await printTOC_Tbl(postData, page, tabIndex, i);
          break;
      }
    }
  }
};

module.exports = {
  checkDomain,
  setHeightOfWidgets,
  printTabPage,
  generatePDF,
};
