import * as rsys from '../client/rsys';
import Dataframe from '../renderer/Dataframe';
import Metadata from '../renderer/Metadata';
import CartoValidationError, { CartoValidationTypes as cvt } from '../errors/carto-validation-error';
// import CartoRuntimeError, { CartoRuntimeTypes as crt } from '../errors/carto-runtime-error';
import util from '../utils/util';
import Base from './Base';
// import schema from '../renderer/schema';

import * as GeoTIFF from 'geotiff';

// const SAMPLE_TARGET_SIZE = 1000;

export default class Grid extends Base {
    /**
     * Create a carto.source.Grid source from a GeoTIFF file
     *
     * @param {string} url - A URL pointing to a GeoTIFF file
     *
     * @fires CartoError
     *
     * @constructor Grid
     * @extends carto.source.Base
     * @memberof carto.source
     * @api
     */
    constructor (url) {
        super();
        this._checkUrl(url);

        this._url = url;
        this._gridFields = new Set();
        this._properties = {};
        // this._boundBands = new Set(); // might be interesting.
        this.initializationPromise = this._initializeRasterDataset(this._url);
    }

    async _initializeRasterDataset (url) {
        this._grid = await this._loadFrom(url);
        this._setCoordinates();
    }

    async _loadFrom (url) {
        const tiff = await GeoTIFF.fromUrl(url);
        const image = await tiff.getImage();
        const data = await image.readRasters();

        // const firstBand = data[0]; // TODO FIX me with options
        // const band = firstBand;

        // const origin = image.getOrigin();
        // const resolution = image.getResolution();
        // const bbox = image.getBoundingBox();

        const grid = {
            data,
            bbox: image.getBoundingBox(),
            width: image.getWidth(),
            height: image.getHeight()
        };

        return grid;
    }

    _checkUrl (url) {
        if (util.isUndefined(url)) {
            throw new CartoValidationError(`${cvt.MISSING_REQUIRED} 'url'`);
        }
        if (!util.isString(url)) {
            throw new CartoValidationError(`${cvt.INCORRECT_TYPE} 'url' property must be a string.`);
        }
    }

    // sets this._center, this._dataframeCenter and this._size
    _setCoordinates () {
        // TODO Asuming the raster is already in WebMercator
        const [xmin, ymin, xmax, ymax] = this._grid.bbox;
        this._center = {
            x: (xmin + xmax) / 2.0,
            y: (ymin + ymax) / 2.0
        };

        this._dataframeCenter = this._webMercatorToR(this._center.x, this._center.y);

        const lowerLeft = this._webMercatorToR(xmin, ymin);
        const upperRight = this._webMercatorToR(xmax, ymax);
        this._gridSize = {
            width: upperRight.x - lowerLeft.x,
            height: upperRight.y - lowerLeft.y
        };
    }

    _webMercatorToR (x, y) {
        return rsys.wToR(x, y, { scale: util.WM_R, center: { x: 0, y: 0 } });
    }

    requestData () {
        if (this._dataframe) {
            // const newProperties = this._decodeUnboundProperties();
            // this._dataframe.addProperties(newProperties);
            // Object.keys(newProperties).forEach(propertyName => {
            //     this._boundColumns.add(propertyName);
            // });
            return;
        }
        const dataframe = this._buildDataFrame();
        // this._boundBands = new Set(Object.keys(dataframe.properties));
        this._dataframe = dataframe;
        this._addDataframe(dataframe);
        this._dataLoadedCallback();
    }

    _buildDataFrame () {
        return new Dataframe({
            active: true,
            center: this._dataframeCenter,
            gridSize: this._gridSize,
            geom: this._getGeometry(),
            properties: this._getProperties(),
            scale: 1,
            // size: this._features.length,
            type: 'grid',
            metadata: this._metadata
        });
    }

    bindLayer (addDataframe, dataLoadedCallback) {
        this._addDataframe = addDataframe;
        this._dataLoadedCallback = dataLoadedCallback;
    }

    requestMetadata (viz) {
        return Promise.resolve(this._computeMetadata(viz));
    }

    requiresNewMetadata () {
        return false;
    }

    _clone () {
        return this;
    }

    _getGeometry () {
        // const [xmin, ymin, xmax, ymax] = this._grid.bbox;

        // These are texture coordinates... not refering to WebMercator, nor WebGL space
        const coordinates = new Float32Array([
            0.0, 0.0,
            1.0, 0.0,
            0.0, 1.0,
            0.0, 1.0,
            1.0, 0.0,
            1.0, 1.0]
        );
        return coordinates;
    }

    _getProperties () {
        const properties = {};
        if (this._grid && this._grid.data) {
            const data = this._grid.data;
            for (let i = 0; i <= data.length; i++) {
                properties[`band${i}`] = data[i];
            }
        }
        return properties;
    }

    // _initializeFeatureProperties (features) {.
    //     for (let i = 0; i < features.length; i++) {
    //         features[i].properties = features[i].properties || {};
    //     }
    //     return features;
    // }

    _computeMetadata (viz) {
        // const sample = [];
        // this._addNumericColumnField('cartodb_id');

        // const featureCount = this._features.length;
        // const requiredColumns = new Set(Object.keys(schema.simplify(viz.getMinimumNeededSchema())));
        // for (let i = 0; i < this._features.length; i++) {
        //     const properties = this._features[i].properties;
        //     const keys = Object.keys(properties);
        //     for (let j = 0, len = keys.length; j < len; j++) {
        //         const name = keys[j];
        //         if (!requiredColumns.has(name) || this._boundColumns.has(name)) {
        //             continue;
        //         }
        //         const value = properties[name];
        //         this._addPropertyToMetadata(name, value);
        //     }
        //     this._sampleFeatureOnMetadata(properties, sample, this._features.length);
        // }

        // this._numFields.forEach(name => {
        //     const property = this._properties[name];
        //     property.avg = property.sum / property.count;
        // });

        // let geomType = '';
        // if (featureCount > 0) {
        //     // Set the geomType of the first feature to the metadata
        //     geomType = this._getDataframeType(this._features[0].geometry.type);
        // }
        // const idProperty = 'cartodb_id';

        // const property = this._properties['band0'];

        if (this._grid && this._grid.data) {
            const data = this._grid.data;
            for (let i = 0; i <= data.length; i++) {
                this._addGridProperty(`band${i}`);
            }
        }

        this._metadata = new Metadata({
            properties: this._properties,
            featureCount: 0,
            sample: [],
            geomType: 'grid',
            isAggregated: false,
            idProperty: ''
        });

        return this._metadata;
    }

    _addGridProperty (propertyName) {
        if (!this._gridFields.has(propertyName)) {
            this._gridFields.add(propertyName);
            this._properties[propertyName] = {
                type: 'grid',
                min: Number.POSITIVE_INFINITY,
                max: Number.NEGATIVE_INFINITY,
                avg: Number.NaN,
                sum: 0,
                count: 0
            }; // TODO metadata stats
        }
    }

    // // _sampleFeatureOnMetadata (properties, sample, featureCount) {
    // //     if (featureCount > SAMPLE_TARGET_SIZE) {
    // //         const sampling = SAMPLE_TARGET_SIZE / featureCount;
    // //         if (Math.random() > sampling) {
    // //             return;
    // //         }
    // //     }
    // //     sample.push(properties);
    // // }

    // _addNumericPropertyToMetadata (propertyName, value) {
    //     if (this._catFields.has(propertyName) || this._dateFields.has(propertyName)) {
    //         throw new CartoValidationError(`${cvt.INCORRECT_TYPE} Unsupported GeoJSON: the property '${propertyName}' has different types in different features.`);
    //     }
    //     this._addNumericColumnField(propertyName);
    //     const property = this._properties[propertyName];
    //     property.min = Math.min(property.min, value);
    //     property.max = Math.max(property.max, value);
    //     property.sum += value;
    // }

    // _addNumericColumnField (propertyName) {
    //     if (!this._numFields.has(propertyName)) {
    //         this._numFields.add(propertyName);
    //         this._properties[propertyName] = {
    //             type: 'number',
    //             min: Number.POSITIVE_INFINITY,
    //             max: Number.NEGATIVE_INFINITY,
    //             avg: Number.NaN,
    //             sum: 0,
    //             count: 0
    //         };
    //     }
    // }

    // _addDatePropertyToMetadata (propertyName, value) {
    //     if (this._catFields.has(propertyName) || this._numFields.has(propertyName)) {
    //         throw new CartoRuntimeError(
    //             `${crt.NOT_SUPPORTED} Unsupported GeoJSON: the property '${propertyName}' has different types in different features.`
    //         );
    //     }
    //     this._addDateColumnField(propertyName);
    //     const column = this._properties[propertyName];
    //     const dateValue = util.castDate(value);
    //     column.min = column.min ? util.castDate(Math.min(column.min, dateValue)) : dateValue;
    //     column.max = column.max ? util.castDate(Math.max(column.max, dateValue)) : dateValue;
    //     column.sum += value;
    //     column.count++;
    // }

    // _addDateColumnField (propertyName) {
    //     if (!this._dateFields.has(propertyName)) {
    //         this._dateFields.add(propertyName);
    //         this._properties[propertyName] = {
    //             type: 'date',
    //             min: null,
    //             max: null,
    //             avg: null,
    //             sum: 0,
    //             count: 0
    //         };
    //     }
    // }

    // _addPropertyToMetadata (propertyName, value) {
    //     if (this._providedDateColumns.has(propertyName)) {
    //         return this._addDatePropertyToMetadata(propertyName, value);
    //     }
    //     if (Number.isFinite(value)) {
    //         return this._addNumericPropertyToMetadata(propertyName, value);
    //     }
    //     this._addCategoryPropertyToMetadata(propertyName, value);
    // }

    // _addCategoryPropertyToMetadata (propertyName, value) {
    //     if (this._numFields.has(propertyName) || this._dateFields.has(propertyName)) {
    //         throw new CartoRuntimeError(
    //             `${crt.NOT_SUPPORTED} Unsupported GeoJSON: the property '${propertyName}' has different types in different features.`
    //         );
    //     }
    //     if (!this._catFields.has(propertyName)) {
    //         this._catFields.add(propertyName);
    //         this._properties[propertyName] = {
    //             type: 'category',
    //             categories: []
    //         };
    //     }
    //     const property = this._properties[propertyName];
    //     const cat = property.categories.find(cat => cat.name === value);
    //     if (cat) {
    //         cat.frequency++;
    //     } else {
    //         property.categories.push({ name: value, frequency: 1 });
    //     }
    // }

    // _decodeUnboundProperties () {
    //     const properties = {};
    //     [...this._numFields].concat([...this._catFields]).concat([...this._dateFields]).map(name => {
    //         if (this._boundColumns.has(name)) {
    //             return;
    //         }
    //         // The dataframe expects to have a padding of 1024, adding 1024 empty values assures this condition is met
    //         properties[name] = new Float32Array(this._features.length + 1024);
    //     });

    //     const catFields = [...this._catFields].filter(name => !this._boundColumns.has(name));
    //     const numFields = [...this._numFields].filter(name => !this._boundColumns.has(name));
    //     const dateFields = [...this._dateFields].filter(name => !this._boundColumns.has(name));

    //     for (let i = 0; i < this._features.length; i++) {
    //         const f = this._features[i];

    //         catFields.forEach(name => {
    //             properties[name][i] = this._metadata.categorizeString(name, f.properties[name], true);
    //         });
    //         numFields.forEach(name => {
    //             if (name === 'cartodb_id' && !Number.isFinite(f.properties.cartodb_id)) {
    //                 // Using negative ids for GeoJSON features
    //                 f.properties.cartodb_id = -i;
    //             }
    //             properties[name][i] = Number(f.properties[name]);
    //         });
    //         dateFields.forEach(name => {
    //             const property = this._properties[name];
    //             // dates in Dataframes are mapped to [0,1] to maximize precision
    //             const d = util.castDate(f.properties[name]).getTime();
    //             const min = property.min;
    //             const max = property.max;
    //             const n = (d - min.getTime()) / (max.getTime() - min.getTime());
    //             properties[name][i] = n;
    //         });
    //     }
    //     return properties;
    // }

    // _fetchFeatureGeometry (options = {}, callback) {
    //     let geometry = null;
    //     const numFeatures = this._features.length;
    //     const incr = options.sample ? Math.max(1, Math.floor(numFeatures / options.sample)) : 1;

    //     for (let i = 0; i < numFeatures; i += incr) {
    //         const feature = this._features[i];
    //         if (feature.type === 'Feature') {
    //             callback(i, feature.geometry);
    //         }
    //     }
    //     return geometry;
    // }

    // // _allocGeometry () {
    // //     if (this._type === 'Point') {
    // //         return new Float32Array(this._features.length * 6);
    // //     }
    // //     return [];
    // // }

    // _computePointGeometry (data) {
    //     const lat = data[1];
    //     const lng = data[0];
    //     const wm = util.projectToWebMercator({ lat, lng });
    //     return rsys.wToR(wm.x, wm.y, { scale: util.WM_R, center: this._center });
    // }

    // _computeLineStringGeometry (data, reverse) {
    //     let line = [];
    //     for (let i = 0; i < data.length; i++) {
    //         const point = this._computePointGeometry(
    //             data[reverse ? (data.length - i - 1) : i]
    //         );
    //         line.push(point.x, point.y);
    //     }
    //     return line;
    // }

    // _computeMultiLineStringGeometry (data) {
    //     let multiline = [];
    //     for (let i = 0; i < data.length; i++) {
    //         let line = this._computeLineStringGeometry(data[i]);
    //         if (line.length > 0) {
    //             multiline.push(line);
    //         }
    //     }
    //     return multiline;
    // }

    // _computePolygonGeometry (data) {
    //     let polygon = {
    //         flat: [],
    //         holes: [],
    //         clipped: []
    //     };
    //     let holeIndex = 0;
    //     let firstReverse = false;

    //     if (data.length) {
    //         firstReverse = this._isReversed(data[0]);
    //         const flat = this._computeLineStringGeometry(data[0], firstReverse);
    //         polygon.flat = polygon.flat.concat(flat);
    //     }
    //     for (let i = 1; i < data.length; i++) {
    //         if (firstReverse !== this._isReversed(data[i])) {
    //             holeIndex += data[i - 1].length;
    //             polygon.holes.push(holeIndex);
    //         }
    //         const flat = this._computeLineStringGeometry(data[i], firstReverse);
    //         polygon.flat = polygon.flat.concat(flat);
    //     }
    //     return polygon;
    // }

    // _computeMultiPolygonGeometry (data) {
    //     let multipolygon = [];
    //     for (let i = 0; i < data.length; i++) {
    //         let polygon = this._computePolygonGeometry(data[i]);
    //         if (polygon.flat.length > 0) {
    //             multipolygon.push(polygon);
    //         }
    //     }
    //     return multipolygon;
    // }

    // _isReversed (vertices) {
    //     let total = 0;
    //     let pt1 = vertices[0];
    //     let pt2;
    //     for (let i = 0; i < vertices.length - 1; i++) {
    //         pt2 = vertices[i + 1];
    //         total += (pt2[1] - pt1[1]) * (pt2[0] + pt1[0]);
    //         pt1 = pt2;
    //     }
    //     // When total is positive it means that vertices are oriented clock wise
    //     // and, since positive orientation is counter-clock wise, it is reversed.
    //     return total >= 0;
    // }

    // _samplePoint (geometry) {
    //     const type = geometry.type;

    //     const coordinates = geometry.coordinates;
    //     if (type === 'Point') {
    //         return coordinates;
    //     } else if (type === 'LineString') {
    //         return coordinates[0];
    //     } else if (type === 'MultiLineString' || type === 'Polygon') {
    //         return coordinates[0][0];
    //     } else if (type === 'MultiPolygon') {
    //         return coordinates[0][0][0];
    //     }
    // }

    free () {
    }
}