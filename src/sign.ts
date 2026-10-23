// Strike API Wallet signing (Ed25519), per docs.strikefinance.org/api/getting-started.
// Message: {METHOD}:{PATH}:{TIMESTAMP}:{NONCE}:{SHA256(body)}. The private key never leaves this tab.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { API } from './api';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface ApiWallet { pub: string; priv: string }

export function derivePub(privHex: string) {
  let b = hexToBytes(privHex.trim().replace(/^0x/, ''));
  if (b.length === 64) b = b.slice(0, 32);
  if (b.length !== 32) throw new Error('Private key must be 64 or 128 hex chars');
  return bytesToHex(ed.getPublicKey(b));
}

export async function signed(w: ApiWallet, method: 'GET' | 'POST' | 'DELETE', path: string, body?: any) {
  let k = hexToBytes(w.priv.trim().replace(/^0x/, ''));
  if (k.length === 64) k = k.slice(0, 32);
  const bodyStr = body ? JSON.stringify(body) : '';
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const msg = `${method}:${path}:${ts}:${nonce}:${bytesToHex(sha256(utf8ToBytes(bodyStr)))}`;
  const sig = bytesToHex(ed.sign(utf8ToBytes(msg), k));
  const headers: Record<string, string> = { 'X-API-Wallet-Public-Key': w.pub, 'X-API-Wallet-Signature': sig, 'X-API-Wallet-Timestamp': ts, 'X-API-Wallet-Nonce': nonce };
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { method, headers, body: body ? bodyStr : undefined });
  const txt = await r.text(); let j: any; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) throw new Error(j?.error || j?.message || j?.msg || `${r.status}`);
  return j;
}
