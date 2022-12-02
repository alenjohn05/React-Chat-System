const chalk = require("chalk");
const log = require("../config/log");
const generatePDF = require("./customFunctions").generatePDF;
const isInViewport = require("./customFunctions").isInViewport;
const scrollbarVisible = require("./customFunctions").scrollbarVisible;

const setContentPageNumbers = async (page, postData) => {
  var tabData = postData.fileData.tabData;
  await page.evaluate((tabData) => {
    setContentPageNumbers(tabData);
  }, tabData);
  return;
};

const changePolicyOrder = async (page) => {
  await page.evaluate(() => {
    changePolicyReportOrder();
  });
};

let setMarginOfFooter = async (page, postData, tabIndex) => {
  let { viewPortHeight, domain } = postData;
  await page.evaluate(
    (domain, viewPortHeight, tabIndex) => {
      setMarginOfFooter(domain, viewPortHeight, tabIndex);
    },
    domain,
    viewPortHeight,
    tabIndex
  );
};

const incFooterPageNo = async (page) => {
  await page.evaluate(() => {
    incFooterPageNo();
  });
};

const nextSetOfRowsInTable = async (page, selector, i = 0, tablePage) => {
  await page.evaluate(
    (selector, i, tablePage) => {
      benchmarkNextSetOfRowsInTable(selector, i, tablePage);
    },
    selector,
    i,
    tablePage
  );
  if (tablePage != 0) {
    await incFooterPageNo(page);
  }
};

const printBenchmarkTbl = async (postData, page, tabIndex, i) => {
  let { fileData, filename } = postData;
  let indexOfTable,
    pdfFileName,
    heightData = fileData.tabData[tabIndex];
  for (let k = 0; k < heightData.pagesForTable.length; k++) {
    indexOfTable = await isInViewport(
      page,
      ".scrollWraper [class^='mfin-tbl']:visible",
      k
    );
    if (indexOfTable) {
      indexOfTable = k;
      break;
    }
  }
  if (!isNaN(indexOfTable)) {
    let pageForTables = heightData.pagesForTable[i];
    let j = 0;
    do {
      pdfFileName = `${filename}_${tabIndex}_${i}_${indexOfTable}_${j}.pdf`;
      fileData.pdfFiles.push(pdfFileName);
      if (indexOfTable > 0 && j == 0) await incFooterPageNo(page);
      await nextSetOfRowsInTable(
        page,
        ".scrollWraper [class^='mfin-tbl']:visible",
        indexOfTable,
        j
      );
      await generatePDF(page, postData);
      j++;
    } while (j < pageForTables);
  }
};

const printTOC_Tbl = async (postData, page, tabIndex, i) => {
  let { fileData, filename } = postData;
  let pdfFileName,
    heightData = fileData.tabData[tabIndex];
  let pageForTables = heightData.pagesForTable[i];
  let j = 0;
  do {
    await page.evaluate((j) => {
      TOC_NextSetOfRowsInTable(j);
    }, j);
    if (j != 0) {
      await incFooterPageNo(page);
    }
    await setMarginOfFooter(page, postData, tabIndex);
    pdfFileName = `${filename}_${tabIndex}_${i}_${j}.pdf`;
    fileData.pdfFiles.push(pdfFileName);
    await generatePDF(page, postData);
    j++;
  } while (j < pageForTables);
};

const printInventoryTbl = async (postData, page, tabIndex, i) => {
  let { fileData, filename } = postData;
  let pdfFileName,
    heightData = fileData.tabData[tabIndex];
  let pageForTables = heightData.pagesForTable[i];
  let j = 0;
  do {
    await page.evaluate(
      (j, pageForTables) => {
        Inventory_NextSetOfRowsInTable(j, pageForTables);
      },
      j,
      pageForTables
    );
    if (j != 0) {
      await incFooterPageNo(page);
    }
    await setMarginOfFooter(page, postData, tabIndex);
    pdfFileName = `${filename}_${tabIndex}_${i}_${j}.pdf`;
    fileData.pdfFiles.push(pdfFileName);
    await generatePDF(page, postData);
    j++;
  } while (j < pageForTables);
};

const coverPageActions = async (page) => {
  await page.evaluate(() => {
    coverPageActions();
  });
};

module.exports = {
  setContentPageNumbers,
  setMarginOfFooter,
  incFooterPageNo,
  nextSetOfRowsInTable,
  changePolicyOrder,
  printBenchmarkTbl,
  printInventoryTbl,
  printTOC_Tbl,
  coverPageActions,
};
