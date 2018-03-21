import * as carto from '../../../src/';
import mapboxgl from '../../../vendor/mapbox-gl-dev';

describe('foo', () => {
    let div, source, style, layer1, map;
    beforeEach(() => {
        div = document.createElement('div');
        div.id = 'map';
        document.body.appendChild(div);

        map = new mapboxgl.Map({
            container: 'map',
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [0, 30],
            zoom: 2
        });

        source = new carto.source.GeoJSON({
            'type': 'Feature',
            'geometry': {
                'type': 'Point',
                'coordinates': [0, 0]
            },
            'properties': {
                'cartodb_id': 1
            }
        });
        style = new carto.Style('color: rgba(1, 0, 0, 1)');
        layer1 = new carto.Layer('layer', source, style);
    });

    xit('should throw an error when some layer is not attached to a map', () => {
        expect(() => { new carto.Interactivity([layer1]); }).toThrowError(/.*map.*/);
    });

    xit('should throw an error when layers belong to different maps', () => {
        const div2 = document.createElement('div');
        div.id = 'map2';
        document.body.appendChild(div2);
        const map2 = new mapboxgl.Map({
            container: 'map2',
            style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
            center: [0, 30],
            zoom: 2
        });
        const layer2 = new carto.Layer('layer', source, style);
        layer1.addTo(map);
        layer2.addTo(map2);  
        expect(() => { new carto.Interactivity([layer1, layer2]); }).toThrowError(/.*map.*/);
    });

    afterEach(() => {
        document.body.removeChild(div);
    });
});
