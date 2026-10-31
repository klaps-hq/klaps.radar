// A halftone dot map of Poland, shared by the series map slide and the
// 11 November reel.

// Rough outline of Poland (lon, lat), enough for a dot map.
const POLAND: [number, number][] = [
  [14.22, 53.92], [15.57, 54.18], [16.85, 54.59], [17.55, 54.76], [18.33, 54.83],
  [18.55, 54.52], [18.66, 54.4], [19.45, 54.38], [20.6, 54.38], [22.79, 54.36],
  [23.32, 54.24], [23.5, 53.97], [23.77, 53.26], [23.9, 52.7], [23.2, 52.32],
  [23.63, 52.08], [23.55, 51.55], [23.8, 51.17], [24.11, 50.86], [23.57, 50.24],
  [22.92, 49.8], [22.7, 49.5], [22.68, 49.06], [22.56, 49.0], [22.0, 49.25],
  [21.5, 49.42], [20.9, 49.33], [20.4, 49.4], [20.09, 49.18], [19.8, 49.2],
  [19.47, 49.6], [19.15, 49.4], [18.85, 49.52], [18.63, 49.75], [18.21, 50.0],
  [17.85, 49.98], [17.6, 50.27], [17.2, 50.4], [16.9, 50.45], [16.67, 50.15],
  [16.25, 50.4], [16.2, 50.65], [15.8, 50.75], [15.0, 50.95], [14.82, 50.87],
  [14.99, 51.15], [14.73, 51.6], [14.6, 51.85], [14.7, 52.1], [14.56, 52.35],
  [14.15, 52.6], [14.12, 52.85], [14.43, 53.25], [14.3, 53.4], [14.25, 53.7],
];
// Equirectangular with the longitude squeezed by cos(52°).
export const project = (lon: number, lat: number): [number, number] => [(lon - 14) * 0.616, 55 - lat];
export const MAP_VIEW = { width: 6.3, height: 6.1 };
// Spacing of the halftone dots that draw the country, in map units.
const GRID_STEP = 0.105;

const insidePolygon = ([x, y]: [number, number], polygon: [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export const HALFTONE: [number, number][] = (() => {
  const shape = POLAND.map(([lon, lat]) => project(lon, lat));
  const dots: [number, number][] = [];
  for (let y = GRID_STEP / 2; y < MAP_VIEW.height; y += GRID_STEP) {
    for (let x = GRID_STEP / 2; x < MAP_VIEW.width; x += GRID_STEP) {
      if (insidePolygon([x, y], shape)) dots.push([x, y]);
    }
  }
  return dots;
})();
