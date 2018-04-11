const map = new carto.Map({
    container: 'map',
    background: 'black'
});

const source = new carto.source.GeoJSON(sources['points']);
// Check that precision is good
const style = new carto.Style(`width: ramp(linear($numeric, 0, 10), [0.10,0.20,0.30]) * $oneHundred / $ten * 10
                               variables: [
                                    oneHundred: $ten * $ten  
                                    ten: 10
                               ]`);
const layer = new carto.Layer('layer', source, style);

layer.addTo(map);
