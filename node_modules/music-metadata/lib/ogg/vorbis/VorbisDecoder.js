import * as Token from 'token-types';
export class VorbisDecoder {
    constructor(data, offset) {
        this.data = data;
        this.offset = offset;
    }
    readInt32() {
        const value = Token.UINT32_LE.get(this.data, this.offset);
        this.offset += 4;
        return value;
    }
    readStringUtf8() {
        const len = this.readInt32();
        const value = new TextDecoder('utf-8').decode(this.data.subarray(this.offset, this.offset + len));
        this.offset += len;
        return value;
    }
    parseUserComment() {
        const offset0 = this.offset;
        const v = this.readStringUtf8();
        const idx = v.indexOf('=');
        return {
            key: v.slice(0, idx).toUpperCase(),
            value: v.slice(idx + 1),
            len: this.offset - offset0
        };
    }
}
//# sourceMappingURL=VorbisDecoder.js.map