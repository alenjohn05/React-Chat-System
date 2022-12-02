const path = require("path");
const defaultViewPortWidth = require("../config/config").defaultViewPortWidth;
const defaultViewPortHeight = require("../config/config").defaultViewPortHeight;
class pdfConfig {
  constructor(opt) {
    this.path = opt.filename
      ? path.join(__dirname, `../../public/pdf-files/${opt.filename}`)
      : path.join(__dirname, "../../public/pdf-files/dashboard.pdf"); //<String>
    this.scale = opt.scale || 1; //<Number> Scale of the webpage rendering. Defaults to 1. Scale amount must be between 0.1 and 2.
    this.displayHeaderFooter = opt.headerTemplate || opt.footerTemplate ? true : false; //<Boolean> Display header and footer. Defaults to false.
    this.printBackground = opt.printBackground || true; //<Boolean> Print background graphics. Defaults to false.
    this.landscape = opt.landscape || true; //<Boolean> Paper orientation. Defaults to false.
    this.headerTemplate = opt.headerTemplate ? opt.headerTemplate : undefined;
    this.footerTemplate = opt.footerTemplate ? opt.footerTemplate : undefined;
    this.pageRanges = opt.pageRanges || ""; //<String> Paper ranges to print, e.g., '1-5, 8, 11-13'
    this.width = opt.width || defaultViewPortWidth - 350; // 352mm in page <string|number> Paper width, accepts values labeled with units.
    this.height = opt.height || defaultViewPortHeight + 137; // 455mm in page <string|number> Paper height, accepts values labeled with units.
    this.format =
      opt.format && (!this.width || !this.width) ? "Letter" : undefined; //<String>  Paper format. If set, takes priority over width or height options. Defaults to 'Letter'.
    this.margin = {
      top: opt.marginTop ? opt.marginTop : 0, // <string|number> Top margin, accepts values labeled with units.
      right: opt.marginRight ? opt.marginRight : 0, //<string|number> Right margin, accepts values labeled with units.
      bottom: opt.marginBottom ? opt.marginBottom : 0, //<string|number> Bottom margin, accepts values labeled with units.
      left: opt.marginLeft ? opt.marginLeft : 0, // <string|number> Left margin, accepts values labeled with units.
    };
    this.preferCSSPageSize = opt.preferCSSPageSize || true; //<boolean> Give any CSS @page size declared in the page priority over what is declared in width and height or format options. Defaults to false, which will scale the content to fit the paper size.
  }
}

module.exports = pdfConfig;
