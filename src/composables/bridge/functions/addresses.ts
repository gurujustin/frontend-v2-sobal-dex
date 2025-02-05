import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { isValidHex } from './utils/hex';
import { toBytesInt32, toU256BE } from './utils/addresses';
import { AccountHex } from '../constants/instructions';

export function neonWalletProgramAddress(
  etherKey: string,
  neonEvmProgram: PublicKey
): [PublicKey, number] {
  const keyBuffer = Buffer.from(
    isValidHex(etherKey) ? etherKey.replace(/^0x/i, '') : etherKey,
    'hex'
  );
  const seed = [
    new Uint8Array([AccountHex.SeedVersion]),
    new Uint8Array(keyBuffer),
  ];
  return PublicKey.findProgramAddressSync(seed, neonEvmProgram);
}

export function neonBalanceProgramAddress(
  etherKey: string,
  neonEvmProgram: PublicKey,
  chainId: number
): [PublicKey, number] {
  const keyBuffer = Buffer.from(
    isValidHex(etherKey) ? etherKey.replace(/^0x/i, '') : etherKey,
    'hex'
  );
  const chainIdBytes = toU256BE(BigInt(chainId)); //chain_id as u256be
  const seed = [
    new Uint8Array([AccountHex.SeedVersion]),
    new Uint8Array(keyBuffer),
    chainIdBytes,
  ];
  return PublicKey.findProgramAddressSync(seed, neonEvmProgram);
}

export function neonBalanceProgramAddressV2(
  etherKey: string,
  operatorKey: PublicKey,
  neonEvmProgram: PublicKey,
  chainId: number
): [PublicKey, number] {
  const keyBuffer = Buffer.from(
    isValidHex(etherKey) ? etherKey.replace(/^0x/i, '') : etherKey,
    'hex'
  );
  const chainIdBytes = toU256BE(BigInt(chainId)); //chain_id as u256be
  const seed = [
    new Uint8Array([AccountHex.SeedVersion]),
    operatorKey.toBytes(), //operator key -> solanaWallet
    new Uint8Array(keyBuffer),
    chainIdBytes,
  ];
  return PublicKey.findProgramAddressSync(seed, neonEvmProgram);
}

export function authAccountAddress(
  neonWallet: string,
  neonEvmProgram: PublicKey,
  address: string
): [PublicKey, number] {
  const neonAccountAddressBytes = Buffer.concat([
    Buffer.alloc(12),
    Buffer.from(
      isValidHex(neonWallet) ? neonWallet.replace(/^0x/i, '') : neonWallet,
      'hex'
    ),
  ]);
  const neonContractAddressBytes = Buffer.from(
    isValidHex(address) ? address.replace(/^0x/i, '') : address,
    'hex'
  );
  const seed = [
    new Uint8Array([AccountHex.SeedVersion]),
    new Uint8Array(Buffer.from('AUTH', 'utf-8')),
    new Uint8Array(neonContractAddressBytes),
    new Uint8Array(neonAccountAddressBytes),
  ];
  return PublicKey.findProgramAddressSync(seed, neonEvmProgram);
}

export function collateralPoolAddress(
  neonWalletPDA: PublicKey,
  collateralPoolIndex: number
): [PublicKey, number] {
  const a = Buffer.from('treasury_pool', 'utf8');
  const b = Buffer.from(toBytesInt32(collateralPoolIndex));
  return PublicKey.findProgramAddressSync([a, b], neonWalletPDA);
}

export function authorityPoolAddress(
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [new Uint8Array(Buffer.from('Deposit', 'utf-8'))],
    programId
  );
}
