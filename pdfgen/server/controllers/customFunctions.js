const pdftk = require("node-pdftk");
const pdfkit = require("pdfkit");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const _ = require("lodash");
const log = require("../config/log");
const PDFParser = require("pdf2json");
const merge = require("easy-pdf-merge");
// const HummusRecipe = require("hummus-recipe");
const fromPath = require("pdf2pic").fromPath;
const { PDFDocument } = require("pdf-lib");
const DEBUG_MODE = require("../config/config").debug_mode;
const pdfConfig = require("./pdfConfig");

pdftk.configure({
  Promise: require("bluebird"),
  ignoreWarnings: true,
});

const generatePDF = async (p, postData) => {
  if (DEBUG_MODE) return;
  else {
    let pageconf = new pdfConfig({
      filename:
        postData.fileData.pdfFiles[postData.fileData.pdfFiles.length - 1],
      headerTemplate: postData.headerTemplate,
      footerTemplate: postData.footerTemplate,
      marginTop: postData.marginTop,
      marginBottom: postData.marginBottom,
      marginLeft:
        postData.dashboardType === "mfin" || postData.dashboardType === "vizru"
          ? 65
          : postData.marginLeft,
      marginRight: postData.marginRight,
    });
    if (postData.dashboardType === "vizru") pageconf.pageRanges = "1";
    await p.pdf(pageconf);
  }
};

const isInViewport = async (page, selector, i = 0) => {
  i = 0;
  let inViewport = await page.evaluate(
    (selector, i) => {
      let div = $(selector).get(i);
      if (!div) return false;
      let bounding = div.getBoundingClientRect();
      let scrollDiv = $(div).parent(".scrollWraper").length
        ? $(div).parent(".scrollWraper")
        : $(div);
      if (
        bounding.top >= 0 &&
        bounding.left >= 0 &&
        bounding.right <=
          (window.innerWidth || document.documentElement.clientWidth) &&
        scrollDiv.height() <=
          (window.innerHeight || document.documentElement.clientHeight)
      ) {
        return true;
      } else {
        return false;
      }
    },
    selector,
    i
  );
  return inViewport;
};

const scrollbarVisible = async (page, selector, i = 0) => {
  let hasScrollBar = await page.evaluate(
    (selector, i) => {
      let element = $($(selector)[i]).parent(".scrollWraper").get(0);
      return element ? element.scrollHeight > element.clientHeight : false;
    },
    selector,
    i
  );
  return hasScrollBar;
};

const calculateFontSize = (textLength, width, height) => {
  return (height / textLength) * ((height * 1.1) / width);
};

const getFilePath = (filename) => {
  return path.join(__dirname, `../../public/pdf-files/${filename}`);
};

const renameFile = (newFileName, oldFileName) => {
  return new Promise((resolve) => {
    fs.renameSync(getFilePath(newFileName), getFilePath(oldFileName));
    resolve();
  });
};

const deleteFile = (filename) => {
  return new Promise((resolve) => {
    fs.access(getFilePath(filename), (error) => {
      if (!error) {
        try {
          fs.unlinkSync(getFilePath(filename));
        } catch (e) {
          log.error("deleteFile::", e);
        }
        resolve();
      } else {
        log.error(chalk.red("FILE DELETE ERROR:::" + error));
        resolve();
      }
    });
  });
};

const addWatermark = (filePath, watermarkFile, cb) => {
  let watermarkFilePath = getFilePath(watermarkFile);
  pdftk
    .input(filePath)
    .stamp(watermarkFilePath)
    .output(filePath)
    .then(async (buffer) => {
      await deleteFile(watermarkFile);
      cb("", "SUCCESFULLY APPLIED WATERMARK");
    })
    .catch(async (err) => {
      await deleteFile(watermarkFile);
      cb("WATTERMARK-APPLYING-ERROR: " + err, null);
    });
};

const watermarkFunc = (postData) => {
  let text = postData.watermark;
  let text_size = postData.text_size;
  let { filename, landscape } = postData;
  return new Promise((resolve) => {
    let filePath = getFilePath(filename);
    let watermarkFile = getFilePath(`watermark_${filename}`);
    const pdfParserWatermark = new PDFParser();
    pdfParserWatermark.loadPDF(filePath); // ex: ./abc.pdf

    pdfParserWatermark.on("pdfParser_dataReady", (pdfData) => {
      let width = pdfData.Pages[0].Width / 4.5;
      let height = pdfData.Pages[0].Height / 4.5;

      width = Math.floor(width * 72);
      height = Math.floor(height * 72);

      let doc = new pdfkit({ margin: 0, size: [width, height] });
      let writeStream = fs.createWriteStream(watermarkFile);
      doc.pipe(writeStream);
      doc.save();

      let halfWidth = doc.page.width / 2;
      let halfHeight = doc.page.height / 2;
      let fontSize  = '';
      if(text_size!=0){
        fontSize = text_size;
      }else{
        fontSize = calculateFontSize(
          text.length,
          doc.page.width,
          doc.page.height
        );
        fontSize = Math.ceil(landscape ? fontSize : fontSize / 3);
      }

      doc
        .font("Helvetica")
        .fontSize(fontSize)
        .rotate(-50, {
          origin: [halfWidth, halfHeight],
        })
        .fillOpacity(0.2)
        .text(text, 0, halfHeight, {
          width: doc.page.width,
          align: "center",
          continued: false,
        });
      doc.end();
      writeStream.on("finish", () => {
        addWatermark(filePath, `watermark_${filename}`, (err, data) => {
          err
            ? log.error(chalk.red("WATERMARK APLLY ERROR:::" + err))
            : log.info(chalk.green(data));
          resolve();
        });
      });
    });
  });
};

const mergePdf = (pdfFiles, filename) => {
  let pdfFilesPath = pdfFiles.map((fl) => getFilePath(fl));
  let filePath = getFilePath(filename);
  return new Promise((resolve, reject) => {
    merge(pdfFilesPath, filePath, (err) => {
      if (err) reject(err);
      pdfFiles.forEach(async (flname) => {
        if (flname !== filename) await deleteFile(flname);
      });
      resolve();
    });
  });
};

const findEmptyPages = (file, postData) => {
  let validPages = [];
  return new Promise((resolve, reject) => {
    const pdfParserEmptypages = new PDFParser();
    pdfParserEmptypages.loadPDF(file);
    pdfParserEmptypages.on("pdfParser_dataError", (errData) =>
      reject(errData.parserError)
    );
    pdfParserEmptypages.on("pdfParser_dataReady", (pdfData) => {
      postData.page_height = pdfData.Pages[0].Height;
      postData.page_width = pdfData.Pages[0].Width;
      pdfData.Pages.map((page, i) => {
        if (!postData.removeEmptyPages) validPages.push(i + 1);
        else {
          if (
            (page.Fills && page.Fills.length > 0) ||
            (page.Texts && page.Texts.length > 0)
          )
            validPages.push(i);
        }
      });
      postData.pages_count = validPages.length;
      resolve(validPages);
    });
  });
};
//1329, 1210, w- h
// const addCustomPageNo = (postData) => {
//   let { filename, pages_count, page_height, page_width } = postData;
//   let filepath = getFilePath(filename);
//   const pdfDoc = new HummusRecipe(filepath, filepath);
//   return new Promise(async (resolve) => {
//     for (let i = 1; i <= pages_count; i++) {
//       let text = `Page ${i}`;
//       await pdfDoc
//         .editPage(i)
//         .text(text, Math.floor(page_width * 14), Math.floor(page_height * 15), {
//           color: "#A9A9A9",
//           size: 34,
//         })
//         .endPage();
//     }
//     pdfDoc.endPDF();
//     log.info(chalk.green(":::CUSTOM PAGE NO APPLIED:::"));
//     resolve();
//   });
// };

const imagesToPdf = async (pathToImageArray, pathToPDF) => {
  let i = 0;
  while (i < pathToImageArray.length) {
    let pathToImage = pathToImageArray[i];
    const pdfDoc =
      i === 0
        ? await PDFDocument.create()
        : await PDFDocument.load(fs.readFileSync(pathToPDF));
    let img;
    if (pathToImage.split(".").pop() === "png")
      img = await pdfDoc.embedPng(fs.readFileSync(pathToImage));
    else img = await pdfDoc.embedJpg(fs.readFileSync(pathToImage));
    const imagePage = pdfDoc.insertPage(i);

    imagePage.drawImage(img, {
      x: 0,
      y: 0,
      width: imagePage.getWidth(),
      height: imagePage.getHeight(),
    });

    const pdfBytes = await pdfDoc.save();
    await fs.writeFileSync(pathToPDF, pdfBytes);
    i++;
  }
};

const pdfToImage = (filename) => {
  const options = {
    density: 100,
    saveFilename: filename.split(".").slice(0, -1).join("."),
    savePath: path.dirname(getFilePath("file.txt")),
    format: "png",
    width: 800,
    height: 1024,
  };
  return new Promise((resolve) => {
    fromPath(getFilePath(filename), options)
      .bulk(-1)
      .then(async (rslve) => {
        log.info(`${filename} TO IMAGE CONVERTED SUCCESFULLY!`, rslve);
        await deleteFile(filename);
        let imageFileNames = _.map(rslve, _.property("name"));
        imageFileNames = _.map(imageFileNames, getFilePath);
        await imagesToPdf(imageFileNames, getFilePath(filename));
        imageFileNames.map(async (e) => {
          await deleteFile(path.basename(e));
        });
        resolve();
      });
  });
};

module.exports = {
  generatePDF,
  isInViewport,
  scrollbarVisible,
  watermarkFunc,
  mergePdf,
  findEmptyPages,
  deleteFile,
  // addCustomPageNo,
  renameFile,
  getFilePath,
  imagesToPdf,
  pdfToImage,
};
