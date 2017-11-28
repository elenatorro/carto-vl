import * as cartocolor from 'cartocolor';
import * as schema from '../schema';

function implicitCast(value) {
    if (Number.isFinite(value)) {
        return float(value);
    }
    return value;
}
var gl = null;
function setGL(_gl) {
    gl = _gl;
}
export {
    Property, Blend, Now, Near, Color, Float, RampColor, FloatMul, FloatDiv, FloatAdd, FloatSub, FloatPow, Log, Sqrt, Sin, Cos, Tan, Sign, SetOpacity, HSV,
    property, blend, now, near, color, float, rampColor, floatMul, floatDiv, floatAdd, floatSub, floatPow, log, sqrt, sin, cos, tan, sign, setOpacity, hsv,
    setGL
};

const schemas = {};
Object.keys(cartocolor).map(name => {
    const s = cartocolor[name];
    var defaultFound = false;
    for (let i = 20; i >= 0; i--) {
        if (s[i]) {
            if (!defaultFound) {
                schemas[name.toLowerCase()] = () => s[i];
                defaultFound = true;
            }
            schemas[`${name.toLowerCase()}_${i}`] = () => s[i];
        }
    }
});
export { schemas };

/*
    Each styling function should:
        - Create their own objects, i.e.: be used without "new"
        - Check input validity on user input (constructor and exposed functions).
        - Have certain functions that never fail:
            - _applyToShaderSource should use uniformIDMaker and propertyTIDMaker to get unique uniform IDs and property IDs as needed
            - _postShaderCompile should get uniform location after program compilation as needed
            - _preDraw should set any program's uniforms as needed
            - isAnimated should return true if the function output could change depending on the timestamp
        - Have a type property declaring the GLSL output type: 'float', 'color'
*/

/*
    TODO
        - Integrated color palettes
        - Type checking for color palettes
        - Allow multiplication, division and pow() to color expressions and color literals
        - Add SetOpacity(colorExpr, opacityFloatOverride)
        - HSV
        - Think about uniform-only types / parameters
        - Think about "Date" and "string" types.
        - Heatmaps (renderer should be improved too to accommodate this)
*/

//WIP, other classes should extend this
class Expression {
    /**
     * @api
     * @hideconstructor
     * @param {*} children
     * @param {*} inlineMaker
     * @param {*} preface
     */
    constructor(children, inlineMaker, preface) {
        this.inlineMaker = inlineMaker;
        this.preface = (preface ? preface : '');
        this.childrenNames = Object.keys(children);
        Object.keys(children).map(name => this[name] = children[name]);
        this._getChildren().map(child => child.parent = this);
    }
    _applyToShaderSource(uniformIDMaker, propertyTIDMaker) {
        const childSources = this.childrenNames.map(name => this[name]._applyToShaderSource(uniformIDMaker, propertyTIDMaker));
        let childInlines = {};
        childSources.map((source, index) => childInlines[this.childrenNames[index]] = source.inline);
        return {
            preface: childSources.map(s => s.preface).reduce((a, b) => a + b, '') + this.preface,
            inline: this.inlineMaker(childInlines, uniformIDMaker, propertyTIDMaker)
        }
    }
    _postShaderCompile(program) {
        this.childrenNames.forEach(name => this[name]._postShaderCompile(program));
    }
    _preDraw(l) {
        this.childrenNames.forEach(name => this[name]._preDraw(l));
    }
    isAnimated() {
        return this._getChildren().some(child => child.isAnimated());
    }
    replaceChild(toReplace, replacer) {
        const name = this.childrenNames.find(name => this[name] == toReplace);
        this[name] = replacer;
        replacer.parent = this;
        replacer.notify = toReplace.notify;
    }
    /**
     * Linear interpolation between this and finalValue with the specified duration
     * @api
     * @param {Expression} final
     * @param {Expression} duration
     * @param {Expression} blendFunc
     */
    blendTo(final, duration = 500, blendFunc = 'linear') {
        const parent = this.parent;
        const blender = blend(this, final, animation(duration));
        parent.replaceChild(this, blender);
        blender.notify();
    }
    _getChildren() {
        return this.childrenNames.map(name => this[name]);
    }
}

class Property extends Expression {
    constructor(name, schema) {
        if (typeof name !== 'string' || name == '') {
            throw new Error(`Invalid property name '${name}'`);
        }
        if (!schema[name]) {
            throw new Error(`Property name not found`);
        }
        super({}, (childInlines, uniformIDMaker, propertyTIDMaker) => `p${propertyTIDMaker(this.name)}`);
        this.name = name;
        this.type = 'float';
        this.schema = schema;
    }
}
const property = (...args) => new Property(...args);

class Now extends Expression {
    constructor(speed) {
        if (speed == undefined) {
            speed = 1;
        }
        if (!Number.isFinite(Number(speed))) {
            throw new Error('Now() only accepts number literals');
        }
        super({ now: float(0) }, inline => inline.now);
        this.type = 'float';
        this.init = Date.now();
        this.speed = speed;
    }
    _preDraw() {
        this.now.expr = (Date.now() - this.init) * this.speed / 1000.;
        this.now._preDraw();
    }
    isAnimated() {
        return true;
    }
}

const now = (speed) => new Now(speed);

class Animation extends Expression {
    //TODO convert to use uniformfloat class
    constructor(duration) {
        if (!Number.isFinite(duration)) {
            throw new Error("Animation only supports number literals");
        }
        super({});
        this.type = 'float';
        this.aTime = Date.now();
        this.bTime = this.aTime + Number(duration);
    }
    _applyToShaderSource(uniformIDMaker, propertyTIDMaker) {
        this._uniformID = uniformIDMaker();
        return {
            preface: `uniform float anim${this._uniformID};\n`,
            inline: `anim${this._uniformID}`
        };
    }
    _postShaderCompile(program) {
        this._uniformLocation = gl.getUniformLocation(program, `anim${this._uniformID}`);
    }
    _preDraw(l) {
        const time = Date.now();
        this.mix = (time - this.aTime) / (this.bTime - this.aTime);
        if (this.mix > 1.) {
            gl.uniform1f(this._uniformLocation, 1);
        } else {
            gl.uniform1f(this._uniformLocation, this.mix);
        }
    }
    isAnimated() {
        return !this.mix || this.mix <= 1.;
    }
}
const animation = (...args) => new Animation(...args);


class HSV extends Expression {
    constructor(h, s, v) {
        h = implicitCast(h);
        s = implicitCast(s);
        v = implicitCast(v);
        if (h.type != 'float' || s.type != 'float' || v.type != 'float') {
            console.warn(h, s, v);
            throw new Error(`SetOpacity cannot be performed between `);
        }
        super({ h: h, s: s, v: v }, inline =>
            `vec4(hsv2rgb(vec3(${inline.h}, clamp(${inline.s}, 0.,1.), clamp(${inline.v}, 0.,1.))), 1)`
            ,
            `
        #ifndef HSV2RGB
        #define HSV2RGB
        vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }
        #endif
        `);
        this.type = 'color';
    }
};
const hsv = (...args) => new HSV(...args);



const genBinaryOp = (jsFn, glsl) =>
    class BinaryOperation extends Expression {
        /**
         * @api
         * @name BinaryOperation
         * @hideconstructor
         * @augments Expression
         * @constructor
         * @param {*} a
         * @param {*} b
         */
        constructor(a, b) {
            if (Number.isFinite(a) && Number.isFinite(b)) {
                return float(jsFn(a, b));
            }
            if (Number.isFinite(a)) {
                a = float(a);
            }
            if (Number.isFinite(b)) {
                b = float(b);
            }
            if (a.type == 'float' && b.type == 'float') {
                super({ a: a, b: b }, inline => glsl(inline.a, inline.b));
                this.type = 'float';
            } else {
                console.warn(a, b);
                throw new Error(`Binary operation cannot be performed between '${a}' and '${b}'`);
            }
        }
    };



class SetOpacity extends Expression {
    constructor(a, b) {
        if (Number.isFinite(b)) {
            b = float(b);
        }
        if (a.type == 'color' && b.type == 'float') {
        } else {
            console.warn(a, b);
            throw new Error(`SetOpacity cannot be performed between '${a}' and '${b}'`);
        }
        super({ a: a, b: b }, inlines => `vec4((${inlines.a}).rgb, ${inlines.b})`);
        this.type = 'color';
    }
};
const setOpacity = (...args) => new SetOpacity(...args);

/**
* @api
* @augments {BinaryOperation}
*/
class FloatMul extends genBinaryOp((x, y) => x * y, (x, y) => `(${x} * ${y})`) { }
const FloatDiv = genBinaryOp((x, y) => x / y, (x, y) => `(${x} / ${y})`);
const FloatAdd = genBinaryOp((x, y) => x + y, (x, y) => `(${x} + ${y})`);
const FloatSub = genBinaryOp((x, y) => x - y, (x, y) => `(${x} - ${y})`);
const FloatPow = genBinaryOp((x, y) => Math.pow(x, y), (x, y) => `pow(${x}, ${y})`);

/**
 *
 * @api
 * @returns {FloatMul}
 */
const floatMul = (...args) => new FloatMul(...args);
const floatDiv = (...args) => new FloatDiv(...args);
const floatAdd = (...args) => new FloatAdd(...args);
const floatSub = (...args) => new FloatSub(...args);
const floatPow = (...args) => new FloatPow(...args);

const genUnaryOp = (jsFn, glsl) => class UnaryOperation extends Expression {
    constructor(a) {
        if (Number.isFinite(a)) {
            return float(jsFn(a));
        }
        if (a.type != 'float') {
            console.warn(a);
            throw new Error(`Binary operation cannot be performed to '${a}'`);
        }
        super({ a: a }, inlines => glsl(inlines.a));
        this.type = 'float';
    }
}

const Log = genUnaryOp(x => Math.log(x), x => `log(${x})`);
const Sqrt = genUnaryOp(x => Math.sqrt(x), x => `sqrt(${x})`);
const Sin = genUnaryOp(x => Math.sin(x), x => `sin(${x})`);
const Cos = genUnaryOp(x => Math.cos(x), x => `cos(${x})`);
const Tan = genUnaryOp(x => Math.tan(x), x => `tan(${x})`);
const Sign = genUnaryOp(x => Math.sign(x), x => `sign(${x})`);

const log = (...args) => new Log(...args);
const sqrt = (...args) => new Sqrt(...args);
const sin = (...args) => new Sin(...args);
const cos = (...args) => new Cos(...args);
const tan = (...args) => new Tan(...args);
const sign = (...args) => new Sign(...args);


const near = (...args) => new Near(...args);

class Near extends Expression {
    constructor(input, center, threshold, falloff) {
        input = implicitCast(input);
        center = implicitCast(center);
        threshold = implicitCast(threshold);
        falloff = implicitCast(falloff);
        if ([input, center, threshold, falloff].some(x => x === undefined || x === null)) {
            throw new Error(`Invalid arguments to Near()`);
        }
        if (input.type != 'float' || center.type != 'float' || threshold.type != 'float' || falloff.type != 'float') {
            throw new Error('Near(): invalid parameter type');
        }
        super({ input: input, center: center, threshold: threshold, falloff: falloff }, (inline) =>
            `1.-clamp((abs(${inline.input}-${inline.center})-${inline.threshold})/${inline.falloff},
            0., 1.)`
        );
        this.type = 'float';
    }
}

class Blend extends Expression {
    constructor(a, b, mix) {
        a = implicitCast(a);
        b = implicitCast(b);
        mix = implicitCast(mix);
        if ([a, b, mix].some(x => x === undefined || x === null)) {
            throw new Error(`Invalid arguments to Blend(): ${args}`);
        }
        if (mix.type != 'float') {
            throw new Error(`Blending cannot be performed by '${mix.type}'`);
        }
        if (schema.checkSchemaMatch(a.schema, b.schema)) {
            throw new Error('Blend parameters schemas mismatch');
        }
        super({ a: a, b: b, mix: mix }, inline => `mix(${inline.a}, ${inline.b}, ${inline.mix})`);
        if (a.type == 'float' && b.type == 'float') {
            this.type = 'float';
        } else if (a.type == 'color' && b.type == 'color') {
            this.type = 'color';
        } else {
            console.warn(a, b);
            throw new Error(`Blending cannot be performed between types '${a.type}' and '${b.type}'`);
        }
        this.schema = a.schema;
    }
    _preDraw(l) {
        super._preDraw(l);
        if (this.mix instanceof Animation && !this.mix.isAnimated()) {
            this.parent.replaceChild(this, this.b);
        }
    }
}

const blend = (...args) => new Blend(...args);

//TODO rename to uniformcolor, write color (plain, literal)
class Color extends Expression {
    constructor(color) {
        if (!Array.isArray(color)) {
            throw new Error(`Invalid arguments to Color(): ${args}`);
        }
        color = color.filter(x => true);
        if (color.length != 4 || !color.every(Number.isFinite)) {
            throw new Error(`Invalid arguments to Color(): ${args}`);
        }
        super({});
        this.type = 'color';
        this.color = color;
    }
    _applyToShaderSource(uniformIDMaker) {
        this._uniformID = uniformIDMaker();
        return {
            preface: `uniform vec4 color${this._uniformID};\n`,
            inline: `color${this._uniformID}`
        };
    }
    _postShaderCompile(program) {
        this._uniformLocation = gl.getUniformLocation(program, `color${this._uniformID}`);
    }
    _preDraw() {
        gl.uniform4f(this._uniformLocation, this.color[0], this.color[1], this.color[2], this.color[3]);
    }
    isAnimated() {
        return false;
    }
}
const color = (...args) => new Color(...args);


function float(x) {
    if (!Number.isFinite(x)) {
        throw new Error(`Invalid arguments to Float(): ${args}`);
    }
    return new Float(x);
}

class Float extends Expression {
    constructor(size) {
        super({});
        this.type = 'float';
        this.expr = size;
    }
    _applyToShaderSource(uniformIDMaker) {
        this._uniformID = uniformIDMaker();
        return {
            preface: `uniform float float${this._uniformID};\n`,
            inline: `float${this._uniformID}`
        };
    }
    _postShaderCompile(program) {
        this._uniformLocation = gl.getUniformLocation(program, `float${this._uniformID}`);
    }
    _preDraw() {
        gl.uniform1f(this._uniformLocation, this.expr);
    }
    isAnimated() {
        return false;
    }
}

function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}


//Palette => used by Ramp, Ramp gets texture2D from palette by asking for number of buckets (0/interpolated palette, 2,3,4,5,6...)

class RampColor extends Expression {
    constructor(input, minKey, maxKey, values) {
        super({ input: input });
        this.type = 'color';
        this.input = input;
        this.minKey = minKey.expr;
        this.maxKey = maxKey.expr;
        this.values = values;

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        const level = 0;
        const internalFormat = gl.RGBA;
        const width = 256;
        const height = 1;
        const border = 0;
        const srcFormat = gl.RGBA;
        const srcType = gl.UNSIGNED_BYTE;
        const pixel = new Uint8Array(4 * width);
        for (var i = 0; i < width; i++) {
            const vlowRaw = values[Math.floor(i / width * (values.length - 1))];
            const vhighRaw = values[Math.ceil(i / width * (values.length - 1))];
            const vlow = [hexToRgb(vlowRaw).r, hexToRgb(vlowRaw).g, hexToRgb(vlowRaw).b, 255];
            const vhigh = [hexToRgb(vhighRaw).r, hexToRgb(vhighRaw).g, hexToRgb(vhighRaw).b, 255];
            const m = i / width * (values.length - 1) - Math.floor(i / width * (values.length - 1));
            const v = vlow.map((low, index) => low * (1. - m) + vhigh[index] * m);
            pixel[4 * i + 0] = v[0];
            pixel[4 * i + 1] = v[1];
            pixel[4 * i + 2] = v[2];
            pixel[4 * i + 3] = v[3];
        }


        gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
            width, height, border, srcFormat, srcType,
            pixel);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }
    _free() {
        gl.deleteTexture(this.texture);
    }
    _applyToShaderSource(uniformIDMaker, propertyTIDMaker) {
        this._UID = uniformIDMaker();
        const input = this.input._applyToShaderSource(uniformIDMaker, propertyTIDMaker);
        return {
            preface: input.preface + `
        uniform sampler2D texRamp${this._UID};
        uniform float keyMin${this._UID};
        uniform float keyWidth${this._UID};
        `,
            inline: `texture2D(texRamp${this._UID}, vec2((${input.inline}-keyMin${this._UID})/keyWidth${this._UID}, 0.5)).rgba`
        };
    }
    _postShaderCompile(program) {
        this.input._postShaderCompile(program);
        this._texLoc = gl.getUniformLocation(program, `texRamp${this._UID}`);
        this._keyMinLoc = gl.getUniformLocation(program, `keyMin${this._UID}`);
        this._keyWidthLoc = gl.getUniformLocation(program, `keyWidth${this._UID}`);
    }
    _preDraw(l) {
        this.input._preDraw(l);
        gl.activeTexture(gl.TEXTURE0 + l.freeTexUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this._texLoc, l.freeTexUnit);
        gl.uniform1f(this._keyMinLoc, (this.minKey));
        gl.uniform1f(this._keyWidthLoc, (this.maxKey) - (this.minKey));
        l.freeTexUnit++;
    }
}

function rampColor(input, minKey, maxKey, values) {
    //TODO contiunuos vs discrete should be decided based on input type => cartegory vs float
    const args = [input, minKey, maxKey, values].map(implicitCast);
    if (args.some(x => x === undefined || x === null)) {
        throw new Error(`Invalid arguments to RampColor(): ${args}`);
    }
    return new RampColor(...args);
}