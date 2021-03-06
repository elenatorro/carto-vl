import NumberCodec from './Number';
import CategoryCodec from './Category';
import CartoRuntimeError, { CartoRuntimeTypes as runtimeErrors } from '../../errors/carto-runtime-error';

export default function MVTCodecFactory (metadata, type, propertyName) {
    switch (type) {
        case 'number':
            return new NumberCodec(metadata, propertyName);
        case 'category':
            return new CategoryCodec(metadata, propertyName);
        default:
            throw new CartoRuntimeError(
                `${runtimeErrors.MVT} MVT decoding error. Feature property value of type '${type}' cannot be decoded.`
            );
    }
}
