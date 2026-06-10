import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "@bitcoinerlab/secp256k1";

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);

export const PEARL_NETWORK = {
  messagePrefix: "\x18Pearl Signed Message:\n",
  bech32: "prl",
  bip32: {
    public: 0x0488b21e,
    private: 0x0488ade4
  },
  pubKeyHash: 0x00,
  scriptHash: 0x05,
  wif: 0x80
};

const BLOCKBOOK = "http://blockbook.pearlresearch.ai/api/v2";
const SATS = 100_000_000n;

function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("不是有效的 hex");
  }
  return Uint8Array.from(clean.match(/.{2}/g).map((b) => Number.parseInt(b, 16)));
}

function toXOnly(pubkey) {
  return pubkey.slice(1, 33);
}

function normalizePrivateKey(input) {
  const value = input.trim();
  if (!value) throw new Error("私钥不能为空");
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    return ECPair.fromPrivateKey(Buffer.from(hexToBytes(value)), {
      network: PEARL_NETWORK,
      compressed: true
    });
  }
  return ECPair.fromWIF(value, PEARL_NETWORK);
}

function signerFromKeyPair(keyPair) {
  return {
    publicKey: Buffer.from(keyPair.publicKey),
    signSchnorr(hash) {
      return Buffer.from(keyPair.signSchnorr(hash));
    }
  };
}

export function privateKeyToAddress(input) {
  const keyPair = normalizePrivateKey(input);
  const { address } = bitcoin.payments.p2tr({
    internalPubkey: toXOnly(Buffer.from(keyPair.publicKey)),
    network: PEARL_NETWORK
  });
  if (!address) throw new Error("无法推导 Pearl 地址");
  return address;
}

export function formatPrl(raw) {
  const value = BigInt(raw || 0);
  const whole = value / SATS;
  const frac = String(value % SATS).padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function parsePrl(text, fieldName) {
  const raw = String(text || "").trim();
  if (!/^\d+(\.\d{1,8})?$/.test(raw)) {
    throw new Error(`${fieldName} 格式不正确`);
  }
  const [whole, frac = ""] = raw.split(".");
  const value = BigInt(whole) * SATS + BigInt((frac + "00000000").slice(0, 8));
  if (value <= 0n) throw new Error(`${fieldName} 必须大于 0`);
  return value;
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `请求失败: ${response.status}`);
  }
  return data;
}

export async function getStatus() {
  return fetchJson(BLOCKBOOK);
}

export async function getBalance(address) {
  const data = await fetchJson(`${BLOCKBOOK}/address/${address}`);
  return {
    confirmed: formatPrl(data.balance || "0"),
    unconfirmed: formatPrl(data.unconfirmedBalance || "0"),
    txs: data.txs || 0
  };
}

export async function getUtxos(address) {
  const data = await fetchJson(`${BLOCKBOOK}/utxo/${address}`);
  if (!Array.isArray(data)) throw new Error("UTXO 返回格式错误");
  return data
    .filter((u) => Number(u.confirmations || 0) > 0 && BigInt(u.value || 0) > 0n)
    .sort((a, b) => Number(BigInt(b.value) - BigInt(a.value)));
}

function selectUtxos(utxos, needed) {
  const selected = [];
  let total = 0n;
  for (const utxo of utxos) {
    selected.push(utxo);
    total += BigInt(utxo.value);
    if (total >= needed) return { selected, total };
  }
  throw new Error(`余额不足，需要 ${formatPrl(needed)} PRL，可用 ${formatPrl(total)} PRL`);
}

export async function buildSignedTransaction({ privateKey, target, amount, fee }) {
  const keyPair = normalizePrivateKey(privateKey);
  const signer = signerFromKeyPair(keyPair);
  const source = privateKeyToAddress(privateKey);
  const amountSats = parsePrl(amount, "金额");
  const feeSats = parsePrl(fee || "0.001", "手续费");
  const needed = amountSats + feeSats;
  const utxos = await getUtxos(source);
  const { selected, total } = selectUtxos(utxos, needed);

  const sourcePayment = bitcoin.payments.p2tr({
    internalPubkey: toXOnly(Buffer.from(keyPair.publicKey)),
    network: PEARL_NETWORK
  });
  const targetScript = bitcoin.address.toOutputScript(target, PEARL_NETWORK);
  const psbt = new bitcoin.Psbt({ network: PEARL_NETWORK });

  for (const utxo of selected) {
    psbt.addInput({
      hash: utxo.txid,
      index: Number(utxo.vout),
      witnessUtxo: {
        script: sourcePayment.output,
        value: BigInt(utxo.value)
      },
      tapInternalKey: toXOnly(Buffer.from(keyPair.publicKey))
    });
  }

  psbt.addOutput({ script: targetScript, value: amountSats });
  const change = total - amountSats - feeSats;
  if (change >= 1000n) {
    psbt.addOutput({ address: source, value: change });
  }

  for (let i = 0; i < selected.length; i += 1) {
    psbt.signInput(i, signer);
  }
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  return {
    rawtx: tx.toHex(),
    txid: tx.getId(),
    source,
    inputCount: selected.length,
    feeSats,
    changeSats: change >= 1000n ? change : 0n
  };
}

export async function broadcastRawTx(rawtx) {
  const response = await fetch(`${BLOCKBOOK}/sendtx/${rawtx}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || `广播失败: ${response.status}`);
  }
  return data.result || data.txid || data;
}
