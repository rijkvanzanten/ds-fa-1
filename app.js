const express = require("express");
const path = require("path");
const knex = require("knex");
const axios = require("axios");
const bodyParser = require("body-parser");

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
  .use(bodyParser.json())
  .set("view engine", "ejs")
  .set("views", path.join(__dirname, "views"))
  .get("/", asyncHandler(renderMap))
  .get("/api/:locationID", asyncHandler(getInfo))
  .post("/api/search", asyncHandler(search))
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
      id: l.id,
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [l.longitude, l.latitude]
      }
    }))
  };

  res.render("index", { locations: geojson });
}

async function getInfo(req, res) {
  const locationID = req.params.locationID;

  const locations = await database
    .select([
      "name",
      "line1",
      "line2",
      "zip",
      "city",
      "state",
      "wheelchair_accessible",
      "latitude",
      "longitude"
    ])
    .from("locations")
    .where({ id: locationID });

  const location = locations[0];

  const meetings = await database
    .select(["id", "title", "details"])
    .from("meetings")
    .where({ location_id: locationID });

  const hours = await database
    .select([
      "meeting_hours.day",
      "meeting_hours.start_time",
      "meeting_hours.end_time",
      "meeting_hours.special_interest",
      "meeting_hours.meeting_id",
      "meeting_types.name AS type"
    ])
    .from("meeting_hours")
    .whereIn("meeting_id", meetings.map(h => h.id))
    .leftJoin("meeting_types", "meeting_hours.meeting_type_id", "meeting_types.id");

  const sorter = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7
  };

  // Combine hours and meetings into a single object
  const result = {
    location,
    meetings: meetings.map(({ id, title, details }) => {
      return {
        title, details,
        hours: hours
          .filter(h => h.meeting_id === id)
          .map(({ day, start_time, end_time, special_interest, type }) => ({
            day: getDayName(day), 
            start_time: formatTime(start_time), 
            end_time: formatTime(end_time), 
            special_interest, 
            type
          }))
          .sort((a, b) => {
            return sorter[a.day] > sorter[b.day] ? 1 : -1;
          })
      };
    }).sort((a, b) => a.title > b.title ? 1 : -1)
  };

  return res.json(result);
}

async function search(req, res) {
  const q = req.body.q;

  const { data } = await axios.get("https://api.wit.ai/message", {
    params: {
      q,
      v: 20181205
    },
    headers: {
      Authorization: `Bearer ${process.env.WIT_KEY}`
    }
  });

  return res.json(data);
}

function errorHandler(error, req, res, next) {
  console.log("\n" + JSON.stringify(error, null, 2) + "\n");
  res.status(500).end();
}

function getDayName(day) {
  switch(day) {
    case "mon":
      return "Monday";
    case "tue":
      return "Tuesday";
    case "wed":
      return "Wednesday";
    case "thu":
      return "Thursday";
    case "fri":
      return "Friday";
    case "sat":
      return "Saturday";
    case "sun":
      return "Sunday";
  }
}

function formatTime(timeString) {
  const H = +timeString.substr(0, 2);
  const h = (H % 12) || 12;
  const ampm = H < 12 ? "AM" : "PM";
  return h + timeString.substr(2, 3) + ampm;
}
