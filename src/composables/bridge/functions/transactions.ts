import {
  AccountInfo,
  AccountMeta,
  Commitment,
  Connection,
  PublicKey,
  RpcResponseAndContext,
  SYSVAR_RENT_PUBKEY,
  SendOptions,
  SimulatedTransactionResponse,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
} from '@solana/web3.js';
import { NeonProxyRpcApi } from '../classes/api';
import {
  ClaimInstructionResult,
  NeonEmulate,
  NeonProgramStatus,
  SolanaAccount,
  ExtendedAccountInfo,
  SourceSplAccountConfig,
  ClaimInstructionConfig,
  SolanaOverrides,
} from '../interfaces/api';
import { Amount } from '../interfaces/tokens';
import { parseUnits } from '@ethersproject/units';
import { BigNumber } from '@ethersproject/bignumber';
import { Wallet } from 'ethers';
import {
  JsonRpcProvider,
  Provider,
  TransactionRequest,
  TransactionResponse,
} from '@ethersproject/providers';
import { SHA256 } from 'crypto-js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AccountLayout,
  RawAccount,
  TOKEN_PROGRAM_ID,
  createApproveInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  erc20ForSPLContract,
  neonWrapper2Contract,
  neonWrapperContract,
} from './contracts';
import {
  COMPUTE_BUDGET_ID,
  NEON_COMPUTE_UNITS,
  NEON_HEAP_FRAME,
  NEON_TOKEN_DECIMALS,
} from '../constants/addresses';
import {
  authAccountAddress,
  authorityPoolAddress,
  collateralPoolAddress,
  neonBalanceProgramAddress,
  neonBalanceProgramAddressV2,
  neonWalletProgramAddress,
} from './addresses';
import { numberTo64BitLittleEndian, toBytesInt32 } from './utils/addresses';
import { NEON_STATUS_MAINNET_SNAPSHOT } from '../constants/proxy';
import { EvmInstruction } from '../constants/instructions';
import { encode } from 'bs58';
import { TokenInfo } from '@/types/TokenList';
import { Signer } from '@ethersproject/abstract-signer';
import { WalletAdapterProps } from '@solana/wallet-adapter-base';
import { Config } from '@/lib/config/types';

export async function neonTransferMintWeb3Transaction(
  connection: Connection,
  provider: JsonRpcProvider,
  proxyApi: NeonProxyRpcApi,
  proxyStatus: NeonProgramStatus,
  neonEvmProgram: PublicKey,
  solanaWallet: PublicKey,
  neonWallet: string,
  splToken: TokenInfo,
  amount: Amount,
  chainId: number
): Promise<Transaction> {
  const fullAmount = parseUnits(amount.toString(), splToken.decimals);
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    new PublicKey(splToken.address_spl ?? ''),
    solanaWallet
  );
  const claimData = claimTransactionData(
    associatedTokenAddress,
    neonWallet,
    fullAmount
  );
  const walletSigner = solanaWalletSigner(provider, solanaWallet, neonWallet);
  const signedTransaction = await neonClaimTransactionFromSigner(
    claimData,
    walletSigner,
    splToken.address
  );
  const { neonKeys, legacyAccounts } = await createClaimInstruction({
    proxyApi,
    neonTransaction: signedTransaction,
    connection,
    signerAddress: walletSigner.address,
    neonEvmProgram,
    splToken,
    associatedTokenAddress,
    fullAmount,
  });

  return neonTransferMintTransaction(
    connection,
    proxyStatus,
    neonEvmProgram,
    solanaWallet,
    neonWallet,
    walletSigner,
    neonKeys,
    legacyAccounts,
    signedTransaction,
    splToken,
    fullAmount,
    chainId
  );
}

export function claimTransactionData(
  associatedToken: PublicKey,
  neonWallet: string,
  amount: BigNumber
): string {
  const claimTo = erc20ForSPLContract().encodeFunctionData('claimTo', [
    associatedToken.toBuffer(),
    neonWallet,
    amount,
  ]);
  return claimTo;
}

export async function neonClaimTransactionFromSigner(
  claimData: string,
  walletSigner: Wallet,
  address: string
): Promise<string> {
  const transaction: TransactionRequest = {
    data: claimData,
    gasLimit: `0x5F5E100`, // 100000000
    gasPrice: `0x0`,
    to: address, // contract address
  };
  const populatedTx = await walletSigner.populateTransaction(transaction);
  return await walletSigner.signTransaction(populatedTx);
}

export function solanaWalletSigner(
  provider: JsonRpcProvider,
  solanaWallet: PublicKey,
  neonWallet: string
): Wallet {
  const emulateSignerPrivateKey = `0x${SHA256(
    solanaWallet.toBase58() + neonWallet
  ).toString()}`;
  const wallet = new Wallet(emulateSignerPrivateKey, provider);
  return wallet;
}

export async function createClaimInstruction(
  config: ClaimInstructionConfig
): Promise<ClaimInstructionResult> {
  const {
    proxyApi,
    neonTransaction,
    connection,
    signerAddress,
    neonEvmProgram,
    splToken,
    associatedTokenAddress,
    fullAmount,
  } = config;
  if (neonTransaction) {
    if (splToken.symbol.toUpperCase() !== 'SOL') {
      const overriddenSourceAccount = await getOverriddenSourceSplAccount({
        connection,
        signerAddress,
        neonEvmProgram,
        splToken,
        fullAmount,
        associatedTokenAddress,
      });
      const solanaOverrides: SolanaOverrides = {
        solanaOverrides: {
          [associatedTokenAddress.toBase58()]: overriddenSourceAccount,
        },
      };
      console.log('[Debug] Solana Overrides', solanaOverrides);
    }
    const neonEmulate: NeonEmulate = await proxyApi.neonEmulate([
      neonTransaction.slice(2),
    ]);
    return createClaimInstructionKeys(neonEmulate);
  }
  return { neonKeys: [], legacyAccounts: [], neonTransaction };
}

export async function getOverriddenSourceSplAccount(
  config: SourceSplAccountConfig
): Promise<ExtendedAccountInfo | any> {
  const {
    connection,
    signerAddress,
    neonEvmProgram,
    splToken,
    fullAmount,
    associatedTokenAddress,
  } = config;

  const [authAccountAddressDelegate] = authAccountAddress(
    signerAddress,
    neonEvmProgram,
    splToken.address
  );

  const sourceAccountInfo = <AccountInfo<Buffer>>(
    await connection.getAccountInfo(associatedTokenAddress)
  );
  const tokenAccountInfo = AccountLayout.decode(sourceAccountInfo.data);
  //For the completely new accounts delegate will be changed

  const updatedTokenAccountInfo = <RawAccount>{
    ...tokenAccountInfo,
    delegateOption: 1,
    delegatedAmount: fullAmount.toBigInt(),
    delegate: authAccountAddressDelegate,
  };

  //Encode data to hex string for the neon proxy
  const buffer = Buffer.alloc(AccountLayout.span);
  AccountLayout.encode(updatedTokenAccountInfo, buffer);

  const dataHexString = buffer.toString('hex');

  return {
    lamports: sourceAccountInfo.lamports,
    data: `0x${dataHexString}`,
    owner: sourceAccountInfo.owner.toBase58(),
    executable: sourceAccountInfo.executable,
    rentEpoch: 0,
  };
}

export function createClaimInstructionKeys(
  neonEmulate: NeonEmulate
): ClaimInstructionResult {
  const legacyAccounts: SolanaAccount[] = [];
  const accountsMap = new Map<string, AccountMeta>();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (neonEmulate!) {
    const { accounts = [], solanaAccounts = [] } = neonEmulate;
    for (const account of accounts) {
      const key = account['account'];
      accountsMap.set(key, {
        pubkey: new PublicKey(key),
        isSigner: false,
        isWritable: true,
      });
      if (account['contract']) {
        const key = account['contract'];
        accountsMap.set(key, {
          pubkey: new PublicKey(key),
          isSigner: false,
          isWritable: true,
        });
      }
    }
    for (const account of solanaAccounts) {
      const { pubkey, isLegacy, isWritable } = account;
      accountsMap.set(pubkey, {
        pubkey: new PublicKey(pubkey),
        isSigner: false,
        isWritable: isWritable,
      });
      if (isLegacy) {
        legacyAccounts.push(account);
      }
    }
  }
  return {
    neonKeys: Array.from(accountsMap.values()),
    legacyAccounts,
    neonTransaction: '',
  };
}

export async function neonTransferMintTransaction(
  connection: Connection,
  proxyStatus: NeonProgramStatus,
  neonEvmProgram: PublicKey,
  solanaWallet: PublicKey,
  neonWallet: string,
  emulateSigner: Wallet,
  neonKeys: AccountMeta[],
  legacyAccounts: SolanaAccount[],
  neonTransaction: string,
  splToken: Config['nativeAsset'] | TokenInfo,
  amount: BigNumber,
  chainId: number
): Promise<Transaction> {
  const computedBudgetProgram = new PublicKey(COMPUTE_BUDGET_ID);
  const [delegatePDA] = authAccountAddress(
    emulateSigner.address,
    neonEvmProgram,
    splToken.address
  );

  const [neonWalletBalanceAddress] = neonBalanceProgramAddress(
    neonWallet,
    neonEvmProgram,
    chainId
  );

  const [emulateSignerBalanceAddress] = neonBalanceProgramAddress(
    emulateSigner.address,
    neonEvmProgram,
    chainId
  );

  const neonWalletBalanceAccount = await connection.getAccountInfo(
    neonWalletBalanceAddress
  );

  const emulateSignerBalanceAccount = await connection.getAccountInfo(
    emulateSignerBalanceAddress
  );

  const associatedTokenAddress = getAssociatedTokenAddressSync(
    new PublicKey(splToken.address_spl ?? ''),
    solanaWallet
  );

  const transaction = new Transaction({ feePayer: solanaWallet });
  transaction.add(
    createComputeBudgetHeapFrameInstruction(computedBudgetProgram, proxyStatus)
  );
  transaction.add(
    createApproveDepositInstruction(
      solanaWallet,
      delegatePDA,
      associatedTokenAddress,
      amount.toBigInt()
    )
  );

  if (!neonWalletBalanceAccount) {
    transaction.add(
      createAccountBalanceInstruction(
        solanaWallet,
        neonEvmProgram,
        neonWallet,
        chainId
      )
    );
  }

  if (!emulateSignerBalanceAccount) {
    transaction.add(
      createAccountBalanceInstruction(
        solanaWallet,
        neonEvmProgram,
        emulateSigner.address,
        chainId
      )
    );
  }

  for (const account of legacyAccounts) {
    const instruction = await createAccountBalanceForLegacyAccountInstruction(
      connection,
      account,
      solanaWallet,
      neonEvmProgram,
      chainId
    );
    if (instruction) {
      transaction.add(instruction);
    }
  }

  if (neonTransaction) {
    transaction.add(
      createExecFromDataInstructionV2(
        solanaWallet,
        neonWallet,
        neonEvmProgram,
        neonTransaction,
        neonKeys,
        proxyStatus,
        chainId
      )
    );
  }

  return transaction;
}

export function createComputeBudgetHeapFrameInstruction(
  programId: PublicKey,
  proxyStatus: NeonProgramStatus
): TransactionInstruction {
  const a = Buffer.from([0x01]);
  const b = Buffer.from(
    toBytesInt32(proxyStatus.neonHeapFrame ?? parseInt(NEON_HEAP_FRAME))
  );
  const data = Buffer.concat([a, b]);
  return new TransactionInstruction({ programId, data, keys: [] });
}

export function createComputeBudgetUtilsInstruction(
  programId: PublicKey,
  proxyStatus: NeonProgramStatus
): TransactionInstruction {
  const a = Buffer.from([0x00]);
  const b = Buffer.from(
    toBytesInt32(proxyStatus.neonComputeUnits ?? parseInt(NEON_COMPUTE_UNITS))
  );
  const c = Buffer.from(toBytesInt32(0));
  const data = Buffer.concat([a, b, c]);
  return new TransactionInstruction({ programId, data, keys: [] });
}

export function createExecFromDataInstructionV2(
  solanaWallet: PublicKey,
  neonWallet: string,
  neonEvmProgram: PublicKey,
  neonRawTransaction: string,
  neonKeys: AccountMeta[],
  proxyStatus: NeonProgramStatus,
  chainId: number
): TransactionInstruction {
  const count = Number(
    proxyStatus.neonTreasuryPoolCount ??
      NEON_STATUS_MAINNET_SNAPSHOT.neonTreasuryPoolCount
  );
  const treasuryPoolIndex = Math.floor(Math.random() * count) % count;
  const [balanceAccount] = neonBalanceProgramAddressV2(
    neonWallet,
    solanaWallet,
    neonEvmProgram,
    chainId
  );
  const [treasuryPoolAddress] = collateralPoolAddress(
    neonEvmProgram,
    treasuryPoolIndex
  );
  const a = Buffer.from([EvmInstruction.TransactionExecuteFromInstruction]);
  const b = Buffer.from(toBytesInt32(treasuryPoolIndex));
  const c = Buffer.from(neonRawTransaction.slice(2), 'hex');
  const data = Buffer.concat([a, b, c]);
  const keys: AccountMeta[] = [
    { pubkey: solanaWallet, isSigner: true, isWritable: true },
    { pubkey: treasuryPoolAddress, isSigner: false, isWritable: true },
    { pubkey: balanceAccount, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: true },
    ...neonKeys,
  ];

  return new TransactionInstruction({ programId: neonEvmProgram, keys, data });
}

export async function createAccountBalanceForLegacyAccountInstruction(
  connection: Connection,
  account: SolanaAccount,
  solanaWallet: PublicKey,
  neonEvmProgram: PublicKey,
  chainId: number
): Promise<TransactionInstruction | null> {
  const accountAddress = new PublicKey(account.pubkey);
  const accountInfo = await connection.getAccountInfo(accountAddress);
  if (accountInfo) {
    const neonAddress = `0x${accountInfo?.data.slice(1, 21).toString('hex')}`;
    return createAccountBalanceInstruction(
      solanaWallet,
      neonEvmProgram,
      neonAddress,
      chainId
    );
  }
  return null;
}

export function createAccountBalanceInstruction(
  solanaWallet: PublicKey,
  neonEvmProgram: PublicKey,
  neonWallet: string,
  chainId: number
): TransactionInstruction {
  const [neonWalletAddress] = neonWalletProgramAddress(
    neonWallet,
    neonEvmProgram
  );
  const [balanceAddress] = neonBalanceProgramAddress(
    neonWallet,
    neonEvmProgram,
    chainId
  );
  const keys = [
    { pubkey: solanaWallet, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: balanceAddress, isSigner: false, isWritable: true },
    { pubkey: neonWalletAddress, isSigner: false, isWritable: true },
  ];
  const a = Buffer.from([EvmInstruction.AccountCreateBalance]);
  const b = Buffer.from(neonWallet.slice(2), 'hex');
  const c = numberTo64BitLittleEndian(chainId);
  const data = Buffer.concat([a, b, c]);
  return new TransactionInstruction({ programId: neonEvmProgram, keys, data });
}

export function createApproveDepositInstruction(
  solanaWallet: PublicKey,
  neonPDAWallet: PublicKey,
  associatedToken: PublicKey,
  amount: number | bigint
): TransactionInstruction {
  return createApproveInstruction(
    associatedToken,
    neonPDAWallet,
    solanaWallet,
    amount
  );
}

export async function sendSolanaTransaction(
  connection: Connection,
  transaction: Transaction,
  confirm = false,
  sendTransaction: WalletAdapterProps['sendTransaction'],
  options?: SendOptions,
  setButtonState?: (state: string) => void
): Promise<TransactionSignature> {
  solanaTransactionLog(transaction);
  const signature = await sendTransaction(transaction, connection, options);
  if (confirm) {
    if (setButtonState)
      setButtonState(
        'Solana transaction submitted, please wait while transaction is mined for next step...'
      );
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
    });
  }
  return signature;
}

export async function sendNeonTransaction(
  transaction: TransactionRequest,
  signer: Signer
): Promise<TransactionResponse> {
  const receipt = await signer.sendTransaction(transaction);
  return receipt;
}

export function solanaTransactionLog(transaction: Transaction): void {
  console.log(
    transaction.instructions
      .map(({ programId, keys, data }, index) => {
        return `[${index}] programId: ${programId.toBase58()}
keys:
${keys
  .map(
    k =>
      `${k.pubkey.toBase58()} [${k.isSigner ? 'signer' : ''}${
        k.isSigner && k.isWritable ? ', ' : ''
      }${k.isWritable ? 'writer' : ''}]`
  )
  .join('\n')}
data:
${encode(data)}
0x${Buffer.from(data).toString('hex')}
${JSON.stringify(data)}
------------------------------`;
      })
      .join('\n\n')
  );
}

export function createMintSolanaTransaction(
  solanaWallet: PublicKey,
  tokenMint: PublicKey,
  associatedToken: PublicKey,
  proxyStatus: NeonProgramStatus
): Transaction {
  const computedBudgetProgram = new PublicKey(COMPUTE_BUDGET_ID);
  const transaction = new Transaction({ feePayer: solanaWallet });
  // transaction.add(createComputeBudgetUtilsInstruction(computedBudgetProgram, proxyStatus));
  transaction.add(
    createComputeBudgetHeapFrameInstruction(computedBudgetProgram, proxyStatus)
  );
  transaction.add(
    createAssociatedTokenAccountInstruction(
      tokenMint,
      associatedToken,
      solanaWallet,
      solanaWallet
    )
  );
  return transaction;
}

export async function createMintNeonWeb3Transaction(
  provider: Provider,
  neonWallet: string,
  associatedToken: PublicKey,
  splToken: TokenInfo,
  amount: Amount,
  gasLimit = 5e4
): Promise<TransactionRequest> {
  const data = mintNeonTransactionData(associatedToken, splToken, amount);
  const transaction = createMintNeonTransaction(neonWallet, splToken, data);
  transaction.gasPrice = await provider.getGasPrice();
  const gasEstimate = (await provider.estimateGas(transaction)).toNumber();
  transaction.nonce = await provider.getTransactionCount(neonWallet);
  // @ts-ignore
  transaction.gasLimit = gasEstimate > gasLimit ? gasEstimate + 1e4 : gasLimit;
  return transaction;
}

export function mintNeonTransactionData(
  associatedToken: PublicKey,
  splToken: TokenInfo,
  amount: Amount
): string {
  const fullAmount = parseUnits(amount.toString(), splToken.decimals);
  return erc20ForSPLContract().encodeFunctionData('transferSolana', [
    associatedToken.toBuffer(),
    fullAmount,
  ]);
}

export function createMintNeonTransaction(
  neonWallet: string,
  splToken: TokenInfo,
  data: string
): TransactionRequest {
  return { data, from: neonWallet, to: splToken.address, value: `0x0` };
}

export async function simulateTransaction(
  connection: Connection,
  transaction: Transaction,
  commitment: Commitment
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
  const { blockhash } = await connection.getLatestBlockhash(commitment);
  transaction.recentBlockhash = blockhash;
  const signData = transaction.serializeMessage();
  // @ts-ignore
  const wireTransaction = transaction._serialize(signData);
  const encodedTransaction = wireTransaction.toString('base64');
  const config: any = { encoding: 'base64', commitment };
  const args = [encodedTransaction, config];

  // @ts-ignore
  const res = await connection._rpcRequest('simulateTransaction', args);
  if (res.error || res.result.value.err) {
    console.log(res);
    throw new Error(
      `Transaction simulation failed: ${
        res.error
          ? res.error.message
          : typeof res.result.value.err === 'string'
          ? res.result.value.err
          : Object.keys(res.result.value.err)
      }. Please try again later.`
    );
  }
  return res.result;
}

// Neon -> Solana - Bespoke Instruction
export function createAssociatedTokenAccountInstruction(
  tokenMint: PublicKey,
  associatedAccount: PublicKey,
  owner: PublicKey,
  payer: PublicKey,
  associatedProgramId: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID,
  programId: PublicKey = TOKEN_PROGRAM_ID
) {
  const data = Buffer.from([0x01]);
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedAccount, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: tokenMint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];
  return new TransactionInstruction({
    programId: associatedProgramId,
    keys,
    data,
  });
}

export async function solanaNEONTransferTransaction(
  solanaWallet: PublicKey,
  neonWallet: string,
  neonEvmProgram: PublicKey,
  neonTokenMint: PublicKey,
  token: Config['nativeAsset'],
  amount: Amount,
  chainId: number
): Promise<Transaction> {
  const neonToken: Config['nativeAsset'] = {
    ...token,
    decimals: Number(NEON_TOKEN_DECIMALS),
  };

  const [balanceAddress] = neonBalanceProgramAddress(
    neonWallet,
    neonEvmProgram,
    chainId
  );

  const fullAmount = parseUnits(amount.toString(), neonToken.decimals);
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    new PublicKey(neonToken.address_spl ?? ''),
    solanaWallet
  );
  const transaction = new Transaction({ feePayer: solanaWallet });

  transaction.add(
    createApproveInstruction(
      associatedTokenAddress,
      balanceAddress,
      solanaWallet,
      fullAmount.toBigInt()
    )
  );

  transaction.add(
    createNeonDepositToBalanceInstruction(
      chainId,
      solanaWallet,
      associatedTokenAddress,
      neonWallet,
      neonEvmProgram,
      neonTokenMint
    )
  );

  return transaction;
}

export function createNeonDepositToBalanceInstruction(
  chainId: number,
  solanaWallet: PublicKey,
  tokenAddress: PublicKey,
  neonWallet: string,
  neonEvmProgram: PublicKey,
  tokenMint: PublicKey
): TransactionInstruction {
  const [depositWallet] = authorityPoolAddress(neonEvmProgram);
  const [balanceAddress] = neonBalanceProgramAddress(
    neonWallet,
    neonEvmProgram,
    chainId
  );
  const [contractAddress] = neonWalletProgramAddress(
    neonWallet,
    neonEvmProgram
  );
  const poolAddress = getAssociatedTokenAddressSync(
    tokenMint,
    depositWallet,
    true
  );
  const keys = [
    { pubkey: tokenMint, isSigner: false, isWritable: true }, // mint address
    { pubkey: tokenAddress, isSigner: false, isWritable: true }, // source
    { pubkey: poolAddress, isSigner: false, isWritable: true }, // pool key
    { pubkey: balanceAddress, isSigner: false, isWritable: true },
    { pubkey: contractAddress, isSigner: false, isWritable: true }, // contract_account
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: solanaWallet,
      isSigner: true,
      isWritable: true,
    }, // operator
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const a = Buffer.from([EvmInstruction.DepositToBalance]);
  const b = Buffer.from(neonWallet.slice(2), 'hex');
  const c = numberTo64BitLittleEndian(chainId);
  const data = Buffer.concat([a, b, c]);
  return new TransactionInstruction({ programId: neonEvmProgram, keys, data });
}

export async function createUnwrapSOLTransaction(
  connection: Connection,
  solanaWallet: PublicKey,
  splToken: TokenInfo
): Promise<Transaction> {
  const tokenMint = new PublicKey(splToken.address_spl ?? '');
  const associatedToken = getAssociatedTokenAddressSync(
    tokenMint,
    solanaWallet
  );
  const wSOLAccount = await connection.getAccountInfo(associatedToken);

  if (!wSOLAccount) {
    throw new Error(
      `Error: ${associatedToken.toBase58()} haven't created account...`
    );
  }

  const transaction = new Transaction({ feePayer: solanaWallet });
  const instructions: TransactionInstruction[] = [];
  instructions.push(
    createCloseAccountInstruction(associatedToken, solanaWallet, solanaWallet)
  );
  transaction.add(...instructions);
  return transaction;
}

export async function neonNeonWeb3Transaction(
  provider: Provider,
  from: string,
  to: string,
  solanaWallet: PublicKey,
  amount: Amount,
  gasLimit = 5e4
): Promise<TransactionRequest> {
  const data = neonTransactionData(provider, solanaWallet);
  const transaction = neonNeonTransaction(from, to, amount, data);
  transaction.gasPrice = await provider.getGasPrice();
  const gasEstimate = (await provider.estimateGas(transaction)).toNumber();
  // @ts-ignore
  transaction.gasLimit = gasEstimate > gasLimit ? gasEstimate + 1e4 : gasLimit;
  return transaction;
}

export function neonTransactionData(
  provider: Provider,
  solanaWallet: PublicKey
): string {
  return neonWrapperContract().encodeFunctionData('withdraw', [
    solanaWallet.toBuffer(),
  ]);
}

export function neonNeonTransaction(
  from: string,
  to: string,
  amount: Amount,
  data: string
): TransactionRequest {
  const value = `0x${parseUnits(
    Number(amount).toFixed(NEON_TOKEN_DECIMALS).toString(),
    'ether'
  )
    .toBigInt()
    .toString(16)}`;
  return { from, to, value, data };
}

export async function solanaSOLTransferTransaction(
  connection: Connection,
  solanaWallet: PublicKey,
  neonWallet: string,
  neonEvmProgram: PublicKey,
  neonTokenMint: PublicKey,
  token: Config['nativeAsset'],
  amount: Amount,
  chainId: number
): Promise<Transaction> {
  const [balanceAddress] = neonBalanceProgramAddress(
    neonWallet,
    neonEvmProgram,
    chainId
  );
  const fullAmount = parseUnits(amount.toString(), token.decimals);
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    new PublicKey(token.address_spl ?? ''),
    solanaWallet
  );
  const transaction = await createWrapSOLTransaction(
    connection,
    solanaWallet,
    amount,
    token
  );

  transaction.add(
    createApproveInstruction(
      associatedTokenAddress,
      balanceAddress,
      solanaWallet,
      fullAmount.toBigInt()
    )
  );
  transaction.add(
    createNeonDepositToBalanceInstruction(
      chainId,
      solanaWallet,
      associatedTokenAddress,
      neonWallet,
      neonEvmProgram,
      neonTokenMint
    )
  );

  return transaction;
}

export async function createWrapSOLTransaction(
  connection: Connection,
  solanaWallet: PublicKey,
  amount: Amount,
  splToken: Config['nativeAsset']
): Promise<Transaction> {
  const tokenMint = new PublicKey(splToken.address_spl ?? '');
  const lamports = parseUnits(amount.toString(), splToken.decimals);
  const associatedToken = getAssociatedTokenAddressSync(
    tokenMint,
    solanaWallet
  );
  const wSOLAccount = await connection.getAccountInfo(associatedToken);
  const transaction = new Transaction({ feePayer: solanaWallet });
  const instructions: TransactionInstruction[] = [];

  if (!wSOLAccount) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        tokenMint,
        associatedToken,
        solanaWallet,
        solanaWallet
      )
    );
  }

  instructions.push(
    SystemProgram.transfer({
      fromPubkey: solanaWallet,
      toPubkey: associatedToken,
      lamports: lamports.toBigInt(),
    })
  );
  instructions.push(
    createSyncNativeInstruction(associatedToken, TOKEN_PROGRAM_ID)
  );
  transaction.add(...instructions);
  return transaction;
}

export async function createWrapAndTransferSOLTransactionWeb3(
  connection: Connection,
  provider: JsonRpcProvider,
  proxyApi: NeonProxyRpcApi,
  proxyStatus: NeonProgramStatus,
  neonEvmProgram: PublicKey,
  solanaWallet: PublicKey,
  neonWallet: string,
  splToken: Config['nativeAsset'],
  amount: Amount,
  chainId: number
) {
  const instructions: TransactionInstruction[] = [];
  const transaction: Transaction = new Transaction({ feePayer: solanaWallet });
  const tokenMint = new PublicKey(splToken.address_spl ?? '');
  const fullAmount = parseUnits(amount.toString(), splToken.decimals);
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    tokenMint,
    solanaWallet
  );
  const wSOLAccount = await connection.getAccountInfo(associatedTokenAddress);
  const claimData = claimTransactionData(
    associatedTokenAddress,
    neonWallet,
    fullAmount
  );
  const walletSigner = solanaWalletSigner(provider, solanaWallet, neonWallet);
  const signedTransaction = await neonClaimTransactionFromSigner(
    claimData,
    walletSigner,
    splToken.address
  );

  // add chainId for compatibility
  const splTokenExtended: TokenInfo = { ...splToken, chainId };

  const { neonKeys, legacyAccounts } = await createClaimInstruction({
    proxyApi,
    neonTransaction: signedTransaction,
    connection,
    signerAddress: walletSigner.address,
    neonEvmProgram,
    splToken: splTokenExtended,
    associatedTokenAddress,
    fullAmount,
  });

  if (!wSOLAccount) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        tokenMint,
        associatedTokenAddress,
        solanaWallet,
        solanaWallet
      )
    );
  }
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: solanaWallet,
      toPubkey: associatedTokenAddress,
      lamports: fullAmount.toBigInt(),
    })
  );
  instructions.push(
    createSyncNativeInstruction(associatedTokenAddress, TOKEN_PROGRAM_ID)
  );
  transaction.add(...instructions);

  const mintTransaction = await neonTransferMintTransaction(
    connection,
    proxyStatus,
    neonEvmProgram,
    solanaWallet,
    neonWallet,
    walletSigner,
    neonKeys,
    legacyAccounts,
    signedTransaction,
    splToken,
    fullAmount,
    chainId
  );
  transaction.add(...mintTransaction.instructions);

  return transaction;
}

export async function unwrapNeonWeb3(
  signer: Signer,
  token: TokenInfo,
  amount: Amount
): Promise<TransactionResponse> {
  const contract = neonWrapper2Contract(signer, token.address);
  const unwrapTx = await contract.withdraw(
    parseUnits(amount.toString(), token.decimals)
  );
  return unwrapTx;
}
