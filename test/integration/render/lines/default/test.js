/* global carto */

carto.setDefaultAuth({
    user: 'arroyo-carto',
    apiKey: 'YOUR_API_KEY'
});

const map = new carto.Map({
    container: 'map'
});

const source = new carto.source.Dataset('route');
const style = new carto.Style();
const layer = new carto.Layer('layer', source, style);

layer.addTo(map);
