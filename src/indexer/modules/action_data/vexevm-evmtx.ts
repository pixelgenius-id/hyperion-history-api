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
            // nested list
            const headerLen = b <= 0xf7 ? 1 : 1 + (b - 0xf7);
            const nestedLen = b <= 0xf7 ? b - 0xc0 : parseInt(buf.slice(pos + 1, pos + headerLen).toString('hex'), 16);
            items.push(buf.slice(pos, pos + headerLen + nestedLen));
            pos += headerLen + nestedLen;
        }
    }
    return items;
}

function keccak256(data: Buffer): string {
    return ethers.keccak256('0x' + data.toString('hex'));
}

export const hyperionModule = {
    chain: '*',
    contract: 'vex.evm',
    action: 'evmtx',
    parser_version: ['3.2', '2.1', '1.8', '1.7'],
    requiresFeature: 'evm_support',
    defineQueryPrefix: 'evm',
    handler: (action: any) => {
        try {
            const data = action['act']['data'];
            if (!data || !Array.isArray(data['event']) || data['event'].length < 2) return;

            const [evType, evData] = data['event'];
            const rlptxHex: string = evData?.rlptx || '';
            if (!rlptxHex || rlptxHex === '00') return;

            const buf = Buffer.from(rlptxHex, 'hex');
            const hash = keccak256(buf);

            // EIP-2718: typed transactions have a type byte (< 0x80) before the RLP
            const txType = buf[0] < 0x80 ? buf[0] : 0;
            const rlpBuf = txType !== 0 ? buf.slice(1) : buf;
            const fields = rlpDecodeList(rlpBuf);

            let nonce: number, gasPrice: bigint, gasLimit: number,
                to: string | null, value: bigint, inputData: string;

            if (txType === 2) {
                // EIP-1559: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, ...]
                if (fields.length < 9) return;
                nonce     = fields[1].length ? parseInt(fields[1].toString('hex'), 16) : 0;
                gasPrice  = fields[3].length ? BigInt('0x' + fields[3].toString('hex')) : 0n;
                gasLimit  = fields[4].length ? parseInt(fields[4].toString('hex'), 16) : 0;
                to        = fields[5].length ? '0x' + fields[5].toString('hex') : null;
                value     = fields[6].length ? BigInt('0x' + fields[6].toString('hex')) : 0n;
                inputData = fields[7].toString('hex');
            } else if (txType === 1) {
                // EIP-2930: [chainId, nonce, gasPrice, gasLimit, to, value, data, accessList, ...]
                if (fields.length < 8) return;
                nonce     = fields[1].length ? parseInt(fields[1].toString('hex'), 16) : 0;
                gasPrice  = fields[2].length ? BigInt('0x' + fields[2].toString('hex')) : 0n;
                gasLimit  = fields[3].length ? parseInt(fields[3].toString('hex'), 16) : 0;
                to        = fields[4].length ? '0x' + fields[4].toString('hex') : null;
                value     = fields[5].length ? BigInt('0x' + fields[5].toString('hex')) : 0n;
                inputData = fields[6].toString('hex');
            } else {
                // Legacy: [nonce, gasPrice, gasLimit, to, value, data, v, r, s]
                if (fields.length < 7) return;
                nonce     = fields[0].length ? parseInt(fields[0].toString('hex'), 16) : 0;
                gasPrice  = fields[1].length ? BigInt('0x' + fields[1].toString('hex')) : 0n;
                gasLimit  = fields[2].length ? parseInt(fields[2].toString('hex'), 16) : 0;
                to        = fields[3].length ? '0x' + fields[3].toString('hex') : null;
                value     = fields[4].length ? BigInt('0x' + fields[4].toString('hex')) : 0n;
                inputData = fields[5].toString('hex');
            }

            let from: string | null = null;
            try {
                const parsed = ethers.Transaction.from('0x' + rlptxHex);
                from = parsed.from ?? null;
            } catch (_e) {}

            action['@evmtx'] = {
                hash:      hash,
                from,
                to:        to,
                value:     value.toString(),
                nonce:     nonce,
                gas_price: gasPrice.toString(),
                gas_limit: gasLimit,
                input:     inputData || null,
                version:   evData?.eos_evm_version ?? null,
                type:      txType,
            };
        } catch (e: any) {
            // silent fail — don't break indexing
        }
    },
};
