const express = require("express");
const path = require("path");

module.exports = express()
  .use(express.static(path.join(__dirname, "public")))
  .set("view engine", "ejs")
  .set("views", path.join(__dirname, "views"))
  .get("/", (req, res) => res.render("index"));
