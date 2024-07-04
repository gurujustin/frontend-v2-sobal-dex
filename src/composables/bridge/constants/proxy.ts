import { NeonProgramStatus } from '../interfaces/api';

export const NEON_STATUS_MAINNET_SNAPSHOT: NeonProgramStatus = {
  neonAccountSeedVersion: 3,
  neonMaxEvmStepsInLastIteration: 0,
  neonMinEvmStepsInIteration: 500,
  neonGasLimitMultiplierWithoutChainId: 1000,
  neonHolderMessageSize: 950,
  neonPaymentToTreasury: 5000,
  neonStorageEntriesInContractAccount: 64,
  neonTreasuryPoolCount: 128,
  neonTreasuryPoolSeed: 'treasury_pool',
  neonEvmProgramId: 'NeonVMyRX5GbCrsAHnUwx1nYYoJAtskU1bWUo6JGNyG',
};

export const NEON_STATUS_DEVNET_SNAPSHOT: NeonProgramStatus = {
  neonAccountSeedVersion: 3,
  neonMaxEvmStepsInLastIteration: 0,
  neonMinEvmStepsInIteration: 500,
  neonGasLimitMultiplierWithoutChainId: 1000,
  neonHolderMessageSize: 950,
  neonPaymentToTreasury: 5000,
  neonStorageEntriesInContractAccount: 64,
  neonTreasuryPoolCount: 128,
  neonTreasuryPoolSeed: 'treasury_pool',
  neonEvmProgramId: 'eeLSJgWzzxrqKv1UxtRVVH8FX3qCQWUs9QuAjJpETGU',
};

const proxyStatusSnapshot = new Map<string, NeonProgramStatus>();
proxyStatusSnapshot.set('mainnet', NEON_STATUS_MAINNET_SNAPSHOT);
proxyStatusSnapshot.set('devnet', NEON_STATUS_DEVNET_SNAPSHOT);
