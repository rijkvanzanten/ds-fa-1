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

// Send any uncaught error to the default error handler
function asyncHandler(fn) {
  return function(req, res, next) {
    return Promise.resolve(fn(req, res, next).catch(next));
  };
}

// Fetches the locations, converts it to GeoJSON and renders the home view
async function renderMap(req, res) {
  // The only things we need to render the dots on the map is the lat long and
  // an identifier. We can later use this identifier to fetch the full info of a
  // point
  const locations = await database
    .select("id", "latitude", "longitude")
    .from("locations");

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

// Get the info for a single point on the map by identifier
async function getInfo(req, res) {
  const locationID = req.params.locationID;

  // Fetch the full location data
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

  // Get all the meetings that are held at this location
  const meetings = await database
    .select(["id", "title", "details"])
    .from("meetings")
    .where({ location_id: locationID });

  // For every one of these meetings, fetch the individual meetings
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
    .leftJoin(
      "meeting_types",
      "meeting_hours.meeting_type_id",
      "meeting_types.id"
    );

  // How to sort the days of the week
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
    meetings: meetings
      .map(({ id, title, details }) => {
        return {
          title,
          details,
          hours: hours
            // Only nest the hours of the meeting we're working on
            .filter(h => h.meeting_id === id)

            // Strip out the fields we don't need
            .map(({ day, start_time, end_time, special_interest, type }) => ({
              day: getDayName(day),
              start_time: formatTime(start_time),
              end_time: formatTime(end_time),
              special_interest,
              type
            }))

            // Sort by day of the week
            .sort((a, b) => {
              return sorter[a.day] > sorter[b.day] ? 1 : -1;
            })
        };
      })

      // Sort the top level meetings by title alphabetically
      .sort((a, b) => (a.title > b.title ? 1 : -1))
  };

  return res.json(result);
}

// Send the search query to NLP, use result to search for IDs of locations so the
// application can show just those locations
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

  const info = {};
  let rows = await database
    .select("id")
    .from("locations")
    .map(row => row.id);

  if (data.entities) {
    await Promise.all(
      Object.keys(data.entities).map(async entityName => {
        const entity = data.entities[entityName][0];
        if (entity.confidence < 0.9) return;

        if (entityName === "neighborhood") {
          const center = {
            lat: +entity.metadata.split(",")[0],
            lon: +entity.metadata.split(",")[1]
          };

          info.center = center;

          const locationIDs = await database
            .select("id")
            .from("locations")
            .whereRaw(
              `
          (
            3959 *
            acos(
              cos(radians(${center.lat})) *
              cos(radians(latitude)) *
              cos(
                radians(longitude) - radians(${center.lon})
              ) +
              sin(radians(${center.lat})) *
              sin(radians(latitude))
            )
          ) < 0.75
        `
            )
            .map(row => row.id);

          rows = rows.filter(id => locationIDs.includes(id));
        }

        if (entityName === "datetime") {
          const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
          const date = new Date(entity.value).getDay();
          const day = days[date];

          const dayIDs = await database
            .select("locations.id")
            .from("meeting_hours")
            .leftJoin("meetings", "meeting_hours.meeting_id", "meetings.id")
            .leftJoin("locations", "meetings.location_id", "locations.id")
            .where({ day })
            .groupBy("locations.id")
            .map(row => row.id);

          rows = rows.filter(id => dayIDs.includes(id));
          info.day = day;
        }
      })
    );
  }

  return res.json({
    ids: rows,
    info
  });
}

// Console log any uncaught errors and return a 500 error
function errorHandler(error, req, res, next) {
  console.log("\n" + JSON.stringify(error, null, 2) + "\n");
  res.status(500).end();
}

// Convert a day shorthand to the full name
function getDayName(day) {
  switch (day) {
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

// Convert a timestring YYYY-MM-DDTHH:MM:SS to 12h format
// 2018-12-10T15:36:00 => 3:36PM
function formatTime(timeString) {
  const H = +timeString.substr(0, 2);
  const h = H % 12 || 12;
  const ampm = H < 12 ? "AM" : "PM";
  return h + timeString.substr(2, 3) + ampm;
}
