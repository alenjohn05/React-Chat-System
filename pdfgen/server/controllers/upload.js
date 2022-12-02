const fs = require("fs");
const path = require("path");
const request = require("request").defaults({ rejectUnauthorized: false });
const chalk = require("chalk");
const log = require("../config/log");
const _ = require("lodash");
const mergePdf = require("./customFunctions").mergePdf;
const getFilePath = require("./customFunctions").getFilePath;
const deleteFile = require("./customFunctions").deleteFile;
const imagesToPdf = require("./customFunctions").imagesToPdf;
const pdfToImage = require("./customFunctions").pdfToImage;
const shell = require("shelljs");
const FileType = require("file-type");
const { PDFDocument } = require("pdf-lib");

const UPLOAD_URL =
  "https://receiver-web/workflow.trigger/filepushfrompuppetteer5d8c604952dca";

function downloadSupportFiles(fileUrls, filename) {
  filename = filename.split(".").slice(0, -1).join(".");
  return Promise.all(
    fileUrls.map(function (url, i) {
      if (url)
        return Promise.all([
          new Promise(function (resolve, reject) {
            request(
              url,
              { encoding: "binary" },
              async function (error, response, body) {
                if (error) {
                  log.error(chalk.red(`SUPPORTFILE GET ERROR::${error}`));
                  resolve();
                }
                const fileType = await FileType.fromBuffer(
                  Buffer.from(body, "binary")
                );
                if (!fileType)
                  log.error(
                    chalk.red(
                      `FILETYPE GET ERROR::${url}:::${body.slice(0, 50)}`
                    )
                  );
                if (fileType && fileType.ext === "pdf") {
                  fs.writeFile(
                    getFilePath(`supportFile_${i}_${filename}_org.pdf`),
                    body,
                    "binary",
                    async function (err) {
                      if (err) {
                        log.error(
                          chalk.red(`SUPPORTFILE WRITE ERROR:::${err}`)
                        );
                        reject();
                      }
                      let pdfDoc, srcPdfBytes, srcPdfDoc;

                      try {
                        pdfDoc = await PDFDocument.create();
                        srcPdfBytes = fs.readFileSync(
                          getFilePath(`supportFile_${i}_${filename}_org.pdf`)
                        );
                        srcPdfDoc = await PDFDocument.load(srcPdfBytes);
                      } catch (err) {
                        log.info(
                          "ENCRYPTED SUPPORT FILE::",
                          `supportFile_${i}_${filename}_org.pdf`
                        );
                        log.info("CONVERTING SUPPORT FILE TO IMAGE");
                        await pdfToImage(
                          `supportFile_${i}_${filename}_org.pdf`
                        );
                        pdfDoc = await PDFDocument.create();
                        srcPdfBytes = fs.readFileSync(
                          getFilePath(`supportFile_${i}_${filename}_org.pdf`)
                        );
                        srcPdfDoc = await PDFDocument.load(srcPdfBytes);
                      }

                      try {
                        const pages = srcPdfDoc.getPages().length;
                        const validPage = await pdfDoc.copyPages(srcPdfDoc, [
                          ...Array(pages).keys(),
                        ]);
                        validPage.forEach((pages) => pdfDoc.addPage(pages));
                        const pdfBytes = await pdfDoc.save();

                        fs.writeFileSync(
                          getFilePath(`supportFile_${i}_${filename}.pdf`),
                          pdfBytes
                        );
                        await deleteFile(
                          `supportFile_${i}_${filename}_org.pdf`
                        );
                        resolve(`supportFile_${i}_${filename}.pdf`);
                      } catch (err) {
                        log.error(
                          chalk.red(`SUPPORTFILES PAGE COPY ERROR::${err}`)
                        );
                        resolve(`supportFile_${i}_${filename}_org.pdf`);
                      }
                    }
                  );
                } else if (fileType && fileType.mime.indexOf("image") > -1) {
                  fs.writeFile(
                    getFilePath(`supportFile_${i}_${filename}.${fileType.ext}`),
                    body,
                    "binary",
                    async function (err) {
                      if (err) {
                        log.error(
                          chalk.red(`SUPPORTFILE IMAGE WRITE ERROR:::${err}`)
                        );
                        reject();
                      }
                      await imagesToPdf(
                        [
                          getFilePath(
                            `supportFile_${i}_${filename}.${fileType.ext}`
                          ),
                        ],
                        getFilePath(`supportFile_${i}_${filename}.pdf`)
                      );
                      await deleteFile(
                        `supportFile_${i}_${filename}.${fileType.ext}`
                      );
                      resolve(`supportFile_${i}_${filename}.pdf`);
                    }
                  );
                } else {
                  resolve();
                }
              }
            );
          }),
        ]);
    })
  );
}

const uploadFileToLivspace = async (obj) => {
  let jobId = obj.jobId;
  let data = obj.data;
  let uploadUrl = data.uploadUrl || UPLOAD_URL;
  let filename = data.filename;
  let filePreview = data.watermark ? "true" : "false";
  if (data.fileUrls.length && data.requestRetry === 3) {
    let supportFiles = await downloadSupportFiles(data.fileUrls, filename);
    supportFiles = [].concat.apply([], supportFiles);
    supportFiles = supportFiles.filter(Boolean);
    supportFiles.unshift(filename);
    if (Array.isArray(supportFiles) && supportFiles.length > 1)
      await mergePdf(supportFiles, filename, false);
  }
  let formData = {
    crid: data.crid,
    jobId: data.jobid,
    UID: data.UID,
    returnData: data.returnData,
  };
  if (obj.error_code) {
    formData.error_code = obj.error_code;
    formData.error_status = "1";
    formData.error_description = obj.error_description;
    formData.error_string = obj.error_string ? obj.error_string : "";
  } else {
    let metaFilePath = path.join(__dirname, "../../meta.txt");
    if (data.requestRetry === 3) {
      try {
        await shell.exec(
          `pdftk ${getFilePath(
            filename
          )} update_info ${metaFilePath} output ${getFilePath(
            `copy_${filename}`
          )}
          `,
          { silent: true }
        );
        await shell.mv(
          `${getFilePath(`copy_${filename}`)}`,
          getFilePath(filename)
        );
        await shell.exec(
          `qpdf --replace-input --encrypt '' 'C0mpl1@nc3' 128 --print=full --modify=none --extract=n --assemble=n --annotate=n --form=n --modify-other=n -- ${getFilePath(
            filename
          )}`
        );
      } catch (shellerror) {
        log.error(chalk.red(`SHELLJS ERROR::::${shellerror}`));
      }
    }
    if (fs.existsSync(getFilePath(filename))) {
      formData.file = {
        value: fs.createReadStream(getFilePath(filename)),
        options: {
          filename: filename,
          contentType: null,
        },
      };
      formData.error_status = "0";
      formData.preview = filePreview;
    } else {
      formData.error_description = "FILE ACCESS ERROR FOR UPLOAD";
      formData.error_code = "503";
      formData.error_status = "1";
    }
  }
  return new Promise((resolve) => {
    let options = {
      method: "POST",
      url: uploadUrl,
      headers: {
        "cache-control": "no-cache",
        "content-type": "multipart/form-data",
      },
      formData: formData,
    };
    request(options, (error, response, body) => {
      if (!obj.error)
        error
          ? log.error(chalk.red(`JOBID ${jobId} FILE UPLOAD ERROR:::` + error))
          : log.info(chalk.blue(`JOBID ${jobId} FILE UPLOADED SUCCESFULLY`));
      else {
        error
          ? log.error(
              chalk.red(`JOBID ${jobId} ERROR NOTIFY TO WORKFLOW:::` + error)
            )
          : log.info(chalk.blue(`JOBID ${jobId} ERROR NOTIFIED TO WORKFLOW`));
      }
      if (error && data.requestRetry > 0) {
        setTimeout(function () {
          data.requestRetry--;
          log.info(chalk.blue(`JOBID ${jobId} RETRYING REQUEST`));
          uploadFileToLivspace(obj);
        }, 2000);
      }
      resolve();
    });
  });
};

module.exports = uploadFileToLivspace;
