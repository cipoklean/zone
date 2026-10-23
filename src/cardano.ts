// CIP-30 wallet connect (Eternl, Lace, Nami, Yoroi, Typhon, Vespr, Flint...) -> bech32 address for the wallet lens.
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v: number[]) { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i]; } return c; }
const hrpExp = (h: string) => [...[...h].map(c => c.charCodeAt(0) >> 5), 0, ...[...h].map(c => c.charCodeAt(0) & 31)];
function toWords(bytes: Uint8Array) { let acc = 0, bits = 0; const out: number[] = []; for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); } } if (bits) out.push((acc << (5 - bits)) & 31); return out; }
export function bech32(hrp: string, bytes: Uint8Array) { const d = toWords(bytes); const pm = polymod([...hrpExp(hrp), ...d, 0, 0, 0, 0, 0, 0]) ^ 1; const cs = [0, 1, 2, 3, 4, 5].map(i => (pm >> (5 * (5 - i))) & 31); return hrp + '1' + [...d, ...cs].map(x => CH[x]).join(''); }
const hex2b = (h: string) => new Uint8Array(h.match(/../g)!.map(x => parseInt(x, 16)));
// CIP-30 returns raw address bytes as hex (sometimes CBOR-wrapped bytes); header nibble 0..7 = base/enterprise/pointer, low bit = network.
export function addrFromHex(h: string) { let b = hex2b(h); if (b[0] === 0x58 || b[0] === 0x59) b = b.slice(b[0] === 0x58 ? 2 : 3); const net = b[0] & 0x0f; return bech32(net === 1 ? 'addr' : 'addr_test', b); }
export const cardanoWallets = (): { id: string; name: string; icon: string }[] => { const c = (window as any).cardano || {}; return Object.keys(c).filter(k => c[k]?.enable && c[k]?.name).map(k => ({ id: k, name: c[k].name, icon: c[k].icon })); };
export async function connectCardano(id: string) { const api = await (window as any).cardano[id].enable(); const used: string[] = await api.getUsedAddresses().catch(() => []); const h = used[0] || await api.getChangeAddress(); return addrFromHex(h); }
