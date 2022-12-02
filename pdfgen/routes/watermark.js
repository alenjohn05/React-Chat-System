const express = require("express");
const router = express.Router();
const chalk = require("chalk");
const fs = require("fs");
let path = require("path");

const log = require("../server/config/log");
const getFilePath =
  require("../server/controllers/customFunctions").getFilePath;
const watermarkFunc = require("../server/controllers/customFunctions").watermarkFunc;
const findRemoveSync = require("find-remove");

/* GET /watermark */
router.post("/", async (req, res, next) => {

    //remove old files
    findRemoveSync(path.join(__dirname, "../public/pdf-files"), {
        age: { seconds: 1800 },
        extensions: [".pdf"],
    });

    let filecontent =  req.body.filecontent;
    let filename = Date.now().toString()+'.pdf';
    let filePath = getFilePath(filename);
    log.info(chalk.green("filename:::::",filename));

    const fileCreation = new Promise((resolve) => {
        fs.writeFile(filePath, filecontent, 'base64', error => {
        if (error) {
            throw error;
            resolve();
        } else {
            log.info(chalk.green("file created from base64"));
            resolve();
        }
        });
    });

    await fileCreation.then(value => { 
        postData = {};
        watermark =  req.body.watermark_text;
        postData.watermark = watermark;
        postData.text_size = req.body.text_size;
        postData.filename = filename;
        postData.landscape = false;
    });

    await watermarkFunc(postData);
    log.debug("sentFile");
    res.sendFile(getFilePath(postData.filename));

});



module.exports = router;
