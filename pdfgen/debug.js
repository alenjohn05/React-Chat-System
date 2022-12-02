const deleteFile = require("./server/controllers/customFunctions").deleteFile;
const imagesToPdf = require("./server/controllers/customFunctions").imagesToPdf;
const pdfToImage = require("./server/controllers/customFunctions").pdfToImage;
const getFilePath = require("./server/controllers/customFunctions").getFilePath;
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const WIDTH = 1680;
const HEIGHT = 1932;

const URL = "https://www.google.com";
(async () => {
  let browser = await puppeteer.launch({
    headless: true,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--hide-scrollbars",
      "--disable-web-security",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: WIDTH,
    height: HEIGHT,
  });
  await page.goto(URL, {
    waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
    timeout: 100000,
  });

  console.log("navigated to page");
  // Configure the navigation timeout
  // await page.setDefaultNavigationTimeout(0);
  page.on("console", (consoleObj) =>
    console.log("FROM PAGE:::", consoleObj.text())
  );
  await page.emulateMediaType("screen");

  await page.evaluate(($page) => {
    $page.waitForPromises.forEach(function(element) {
      console.log(JSON.stringify(element));
      element.call();
    });
  });
  // await page.waitForTimeout(800);
  // await page.waitForNavigation({waitUntil: 'networkidle2'})
  console.log("execution completed");
  await browser.close();
})();

// var footer = $($(".footer-section:visible")[0]);
// var gristerEl = $($(footer).closest(".gs-w")[0]);
// var dashboardTab = $(footer).closest(".tab-pane.active").attr("id");
// if (gridster[dashboardTab]) {
//   console.log("here");
//   let data = gridster[dashboardTab].serialize(gristerEl);
//   let dataY =
//     Math.floor((window.innerHeight - 150) / 98) -
//     (gristerEl.data("row") - 1 - 3);
//   gridster[dashboardTab].resize_widget(
//     gristerEl,
//     data[0].size_x,
//     dataY,
//     false
//   );
//   gristerEl.find(".tileListViewsUl").attr("data-sizey-list", dataY);
//   gristerEl.find(".objectContent").attr("data-sizey", dataY);
// }

// window.changeTab = (tabIndex) => {
//   $("body").css("padding", "0px");
//   let tabs = document
//     .getElementById("reportTabEdit")
//     .getElementsByTagName("a");
//   if (tabIndex == 0) $(window).trigger("resize");
//   tabs[tabIndex].click();
//   let event = new CustomEvent("change-tab", {});
//   document.dispatchEvent(event);
// };
