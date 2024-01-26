import { TokenConstants } from '../types';

const tokens: TokenConstants = {
  Popular: {
    Symbols: ['DAI', 'cbETH', 'WETH'],
  },
  InitialSwapTokens: {
    input: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    output: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
  },
  FeaturedSwapTokens: {
    input: '0x4200000000000000000000000000000000000006', // ETH
    output: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  },
  Addresses: {
    nativeAsset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    wNativeAsset: '0x4200000000000000000000000000000000000006', // WETH
    WETH: '0x4200000000000000000000000000000000000006',
    BAL: '0x0000000000000000000000000000000000000000',
  },
};

export default tokens;
