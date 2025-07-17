import { stringToUint8Array, uint8ArrayToString } from 'uint8array-extras';
import * as util from './Util.js';
import { InternalParserError, FieldDecodingError } from '../ParseError.js';
const validFourCC = /^[\x21-\x7e©][\x20-\x7e\x00()]{3}/;
/**
 * Token for read FourCC
 * Ref: https://en.wikipedia.org/wiki/FourCC
 */
export const FourCcToken = {
    len: 4,
    get: (buf, off) => {
        const id = uint8ArrayToString(buf.slice(off, off + FourCcToken.len), 'latin1');
        if (!id.match(validFourCC)) {
            throw new FieldDecodingError(`FourCC contains invalid characters: ${util.a2hex(id)} "${id}"`);
        }
        return id;
    },
    put: (buffer, offset, id) => {
        const str = stringToUint8Array(id);
        if (str.length !== 4)
            throw new InternalParserError('Invalid length');
        buffer.set(str, offset);
        return offset + 4;
    }
};
//# sourceMappingURL=FourCC.js.map