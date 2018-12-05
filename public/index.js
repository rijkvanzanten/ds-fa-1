mapboxgl.accessToken = "pk.eyJ1Ijoicmlqa3ZhbnphbnRlbiIsImEiOiJjanAzNGttNDkwZTg5M2tucjQ3ajNzMTRtIn0.0pE4hqvwifdLDSM14M2o1A";

var map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/basic-v9",
  center: [-74, 40.75],
  zoom: 12
});

map.on("load", function() {
  map.addSource("locations", {
    type: "geojson",
    data: window.__locations__,
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 50
  });

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

  map.addLayer({
    id: "unclustered-point",
    type: "circle",
    source: "locations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#11b4da",
      "circle-radius": 4,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff"
    }
  });
});
