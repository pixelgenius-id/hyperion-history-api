import { ethers } from 'ethers';

function rlpDecodeList(buf: Buffer): Buffer[] {
    const first = buf[0];
    let listStart: number;
    let listLen: number;
    if (first <= 0xf7) {
        listLen = first - 0xc0;
        listStart = 1;
    } else {
        const lenLen = first - 0xf7;
        listLen = parseInt(buf.slice(1, 1 + lenLen).toString('hex'), 16);
        listStart = 1 + lenLen;
    }
    const items: Buffer[] = [];
    let pos = listStart;
    const end = listStart + listLen;
    while (pos < end) {
        const b = buf[pos];
        if (b <= 0x7f) {
            items.push(buf.slice(pos, pos + 1));
            pos += 1;
        } else if (b <= 0xb7) {
            const len = b - 0x80;
            items.push(buf.slice(pos + 1, pos + 1 + len));
            pos += 1 + len;
        } else if (b <= 0xbf) {
            const lenLen2 = b - 0xb7;
            const len = parseInt(buf.slice(pos + 1, pos + 1 + lenLen2).toString('hex') || '0', 16);
            items.push(buf.slice(pos + 1 + lenLen2, pos + 1 + lenLen2 + len));
            pos += 1 + lenLen2 + len;
        } else {
            const headerLen = b <= 0xf7 ? 1 : 1 + (b - 0xf7);
            const nestedLen = b <= 0xf7 ? b - 0xc0 : parseInt(buf.slice(pos + 1, pos + headerLen).toString('hex'), 16);
            items.push(buf.slice(pos, pos + headerLen + nestedLen));
            pos += headerLen + nestedLen;
        }
    }
    return items;
}

function decodeEvmTx(rlptxHex: string): Record<string, any> | null {
    if (!rlptxHex || rlptxHex === '00') return null;
    const buf = Buffer.from(rlptxHex, 'hex');
    const hash = ethers.keccak256('0x' + buf.toString('hex'));

    const txType = buf[0] < 0x80 ? buf[0] : 0;
    const rlpBuf = txType !== 0 ? buf.slice(1) : buf;
    const fields = rlpDecodeList(rlpBuf);

    let nonce: number, gasPrice: bigint, gasLimit: number,
        to: string | null, value: bigint, inputData: string;

    if (txType === 2) {
        if (fields.length < 9) return null;
        nonce     = fields[1].length ? parseInt(fields[1].toString('hex'), 16) : 0;
        gasPrice  = fields[3].length ? BigInt('0x' + fields[3].toString('hex')) : 0n;
        gasLimit  = fields[4].length ? parseInt(fields[4].toString('hex'), 16) : 0;
        to        = fields[5].length ? '0x' + fields[5].toString('hex') : null;
        value     = fields[6].length ? BigInt('0x' + fields[6].toString('hex')) : 0n;
        inputData = fields[7].toString('hex');
    } else if (txType === 1) {
        if (fields.length < 8) return null;
        nonce     = fields[1].length ? parseInt(fields[1].toString('hex'), 16) : 0;
        gasPrice  = fields[2].length ? BigInt('0x' + fields[2].toString('hex')) : 0n;
        gasLimit  = fields[3].length ? parseInt(fields[3].toString('hex'), 16) : 0;
        to        = fields[4].length ? '0x' + fields[4].toString('hex') : null;
        value     = fields[5].length ? BigInt('0x' + fields[5].toString('hex')) : 0n;
        inputData = fields[6].toString('hex');
    } else {
        if (fields.length < 7) return null;
        nonce     = fields[0].length ? parseInt(fields[0].toString('hex'), 16) : 0;
        gasPrice  = fields[1].length ? BigInt('0x' + fields[1].toString('hex')) : 0n;
        gasLimit  = fields[2].length ? parseInt(fields[2].toString('hex'), 16) : 0;
        to        = fields[3].length ? '0x' + fields[3].toString('hex') : null;
        value     = fields[4].length ? BigInt('0x' + fields[4].toString('hex')) : 0n;
        inputData = fields[5].toString('hex');
    }

    // Recover sender from signature using ethers
    let from: string | null = null;
    try {
        const parsed = ethers.Transaction.from('0x' + rlptxHex);
        from = parsed.from ?? null;
    } catch (_e) {}

    return {
        hash,
        from,
        to,
        value: value.toString(),
        nonce,
        gas_price: gasPrice.toString(),
        gas_limit: gasLimit,
        input: inputData || null,
        type: txType,
    };
}

export const hyperionModule = {
    chain: '*',
    contract: 'vex.evm',
    action: 'pushtx',
    parser_version: ['3.2', '2.1', '1.8', '1.7'],
    requiresFeature: 'evm_support',
    defineQueryPrefix: 'evmpush',
    handler: (action: any) => {
        try {
            const data = action['act']['data'];
            if (!data || !data['rlptx']) return;
            const rlptx = data['rlptx'];
            const decoded = decodeEvmTx(typeof rlptx === 'string' ? rlptx : Buffer.from(rlptx).toString('hex'));
            if (!decoded) return;
            action['@pushtx'] = decoded;
        } catch (_e: any) {
            // silent fail
        }
    },
};
