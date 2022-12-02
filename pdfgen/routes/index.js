let express = require("express");
let router = express.Router();

/* GET home page. */
router.get("/", (req, res, next) => {
  res.render("index", { title: "PDF Generation" });
});

/* GET Health route. */
router.get("/health", (req, res, next) => {
  res.sendStatus(200);
});

module.exports = router;
