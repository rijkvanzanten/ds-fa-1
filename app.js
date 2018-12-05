const express = require("express");
const path = require("path");
const knex = require("knex");

require("dotenv").config();

const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

const database = knex({
  client: "pg",
  connection: {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME
  }
});

module.exports = express()
  .use(express.static(path.join(__dirname, "public")))
  .set("view engine", "ejs")
  .set("views", path.join(__dirname, "views"))
  .get("/", asyncHandler(renderMap))
  .post("/", asyncHandler(search))
  .use(errorHandler);

function asyncHandler(fn) {
  return function(req, res, next) {
    return Promise.resolve(fn(req, res, next).catch(next));
  };
}

async function renderMap(req, res) {
  const locations = await database.select("id", "latitude", "longitude").from("locations");

  // Convert the raw locations to GeoJSON. Mapbox on the front-end will use this as
  // the initial dataset
  const geojson = {
    type: "FeatureCollection",
    features: locations.map(l => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [l.longitude, l.latitude],
        properties: {
          id: l.id
        }
      }
    }))
  };

  res.render("index", { locations: geojson });
}

async function search(req, res) {
  
}

function errorHandler(error, req, res) {
  console.log("\n" + error + "\n");
  res.status(500).end();
}
