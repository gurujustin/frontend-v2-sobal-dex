import {
  AccountMeta,
  PublicKey,
  AccountInfo,
  Connection,
} from '@solana/web3.js';
import { GasToken } from './tokens';
import { NeonProxyRpcApi } from '../classes/api';
import { Signer } from '@ethersproject/abstract-signer';
import { TokenInfo } from '@/types/TokenList';
import { BigNumber } from '@ethersproject/bignumber';

export const enum ProxyStatus {
  unknown = 'UNKNOWN',
  work = 'WORK',
  stop = 'EMERGENCY',
}

export interface RPCResponse<T> {
  id: number | string;
  jsonrpc: string;
  result: T;
}

export interface SettingsFormState {
  solanaRpcApi: string;
  neonProxyRpcApi: string;
}

export interface NeonProgramStatus {
  neonAccountSeedVersion: number;
  neonMaxEvmStepsInLastIteration: number;
  neonMinEvmStepsInIteration: number;
  neonGasLimitMultiplierWithoutChainId: number;
  neonHolderMessageSize: number;
  neonPaymentToTreasury: number;
  neonStorageEntriesInContractAccount: number;
  neonTreasuryPoolCount: number;
  neonTreasuryPoolSeed: string;
  neonEvmProgramId: string;
  neonHeapFrame?: number;
  neonComputeUnits?: number;
}

export interface ChainId {
  id: number;
  name: string;
}

export interface NeonEmulate {
  exit_status: 'succeed';
  result: string;
  steps_executed: number;
  used_gas: number;
  iterations: number;
  solanaAccounts: SolanaAccount[];
  accounts?: NeonAccounts[];
}

export interface SolanaAccount {
  pubkey: string;
  isWritable: boolean;
  isLegacy: boolean;
}

export interface NeonAccounts {
  account: string;
  contract: string;
}

export interface ClaimInstructionResult {
  neonTransaction: string;
  neonKeys: AccountMeta[];
  legacyAccounts: SolanaAccount[];
}

export interface MultiTokenProxy {
  signer: Signer;
  proxyRpc: NeonProxyRpcApi;
  proxyStatus: NeonProgramStatus;
  tokensList: GasToken[];
  evmProgramAddress: PublicKey;
}

export interface GasTokenData {
  tokenMintAddress: PublicKey;
  gasToken: GasToken;
}

export type ExtendedAccountInfo = Omit<
  AccountInfo<Buffer>,
  'owner' | 'data' | 'rentEpoch'
> & {
  owner: string;
  data: string;
  rentEpoch: number;
};

export interface SolanaOverrides {
  solanaOverrides: Record<string, ExtendedAccountInfo>;
}

export interface ClaimInstructionConfig {
  proxyApi: NeonProxyRpcApi;
  neonTransaction: string;
  connection: Connection;
  signerAddress: string;
  neonEvmProgram: PublicKey;
  splToken: TokenInfo;
  associatedTokenAddress: PublicKey;
  fullAmount: BigNumber;
}

export interface SourceSplAccountConfig {
  connection: Connection;
  signerAddress: string;
  neonEvmProgram: PublicKey;
  splToken: TokenInfo;
  fullAmount: BigNumber;
  associatedTokenAddress: PublicKey;
}
