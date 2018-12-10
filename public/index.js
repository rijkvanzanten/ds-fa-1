// The server returns an array of locations (latlong) for us to render. These
// locations are accessible in the global __locations__ variable.
const locations = window.__locations__;

mapboxgl.accessToken =
  "pk.eyJ1Ijoicmlqa3ZhbnphbnRlbiIsImEiOiJjanAzNGttNDkwZTg5M2tucjQ3ajNzMTRtIn0.0pE4hqvwifdLDSM14M2o1A";

const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/light-v9",
  center: [-74, 40.75],
  zoom: 12
});

// Keep track of what dot on the map is hovered
let hoveredStateId = null;

// When the map is done loading
map.on("load", function() {
  // Add the locations as a GeoJSON data source
  map.addSource("locations", {
    type: "geojson",
    data: locations,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

  // Render the clusters for the locations dataset
  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "locations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#51bbd6",
      "circle-radius": 20
    }
  });

  // Render a count of items in every cluster
  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "locations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
      "text-size": 12
    }
  });

  // Render individual points. They're only rendered if they aren't clustered
  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "locations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#11b4da",
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        8,
        4
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff"
    }
  });

  map.on("mousemove", "unclustered-point", function(e) {
    map.getCanvas().style.cursor = "pointer";

    // If the hovered thing isn't a cluster
    if (e.features.length > 0) {
      if (hoveredStateId) {
        map.setFeatureState(
          { source: "locations", id: hoveredStateId },
          { hover: false }
        );
      }
      hoveredStateId = e.features[0].id;
      map.setFeatureState(
        { source: "locations", id: hoveredStateId },
        { hover: true }
      );
    }
  });

  map.on("mouseleave", "unclustered-point", function() {
    map.getCanvas().style.cursor = "";

    if (hoveredStateId) {
      map.setFeatureState(
        { source: "locations", id: hoveredStateId },
        { hover: false }
      );
    }
    hoveredStateId = null;
  });

  map.on("click", "unclustered-point", async function(e) {
    const coordinates = e.features[0].geometry.coordinates.slice();

    const id = e.features[0].id;

    const { data } = await axios.get("http://localhost:3000/api/" + id);

    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
    }

    new mapboxgl.Popup()
      .setLngLat(coordinates)
      .setHTML(getMeetingDetailHTML(data))
      .addTo(map);
  });
});

const handleInput = debounce(function(event) {
  if (event.target.value) {
    axios
      .post("/api/search", {
        q: event.target.value
      })
      .then(res => res.data)
      .then(console.log);
  } else {
    // undo filter
  }
}, 500);

document.querySelector("form").addEventListener("submit", event => {
  event.preventDefault();
  return false;
});

document.querySelector("input").addEventListener("input", handleInput);

function getMeetingDetailHTML(data) {
  return `
<div class="popup-content">
  <h2>${data.location.name}</h2>
  <p>
    <a href="https://maps.apple.com/?ll=${data.location.latitude},${
    data.location.longitude
  }">
      ${data.location.line1}<br>
      ${data.location.line2 ? `${data.location.line2}<br>` : ""}
      ${data.location.city}, ${data.location.state} ${data.location.zip}
    </a>
  </p>
  <hr>
  ${data.meetings
    .map(
      meeting => `
    <h3>${meeting.title}</h3>
    ${meeting.details ? `<p>${meeting.details}</p>` : ""}

    <ol>
      ${meeting.hours
        .map(
          ({ day, start_time, end_time, special_interest, type }) => `
      <li>
        ${type} ${special_interest ? `(${special_interest})` : ""}<br>
        ${day}s ${start_time}—${end_time}
      </li>
      `
        )
        .reduce((str, x) => (str += x), "")}
    </ol>
  `
    )
    .reduce((str, x) => (str += x), "")}
</div>
  `;
}

function debounce(func, wait, immediate) {
  var timeout;
  return function() {
    var context = this,
      args = arguments;
    var later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
}
