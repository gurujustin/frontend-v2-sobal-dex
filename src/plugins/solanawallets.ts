import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  // WalletConnectWalletAdapter,
} from '@solana/wallet-adapter-wallets';

import { configService } from '@/services/config/config.service';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';

const solanaRpcUrl = configService.network.solanaRpc;
const solanaRpcName = configService.network.solanaRpcName;

export const SolanaWalletOptions =
  solanaRpcUrl && solanaRpcName
    ? {
        wallets: [
          new PhantomWalletAdapter(),
          new SolflareWalletAdapter({
            network: WalletAdapterNetwork[solanaRpcName],
          }),
          // TODO: Only compatible with WSS - Find WSS compatible rpcs
          // new WalletConnectWalletAdapter({
          //   network: WalletAdapterNetwork[solanaRpcName],
          //   options: {
          //     relayUrl: solanaRpcUrl,
          //     projectId: '96ec07ab805a6abb425fb22135bd41a1',
          //     metadata: {
          //       name: 'Sobal',
          //       description:
          //         'Bringing you the best AMM, trading and DeFi experience by leveraging the power of flexible and powerful Smart Contracts',
          //       url: 'https://app.sobal.fi',
          //       icons: [
          //         'https://avatars.githubusercontent.com/u/106710686?s=200',
          //       ],
          //     },
          //   },
          // }),
        ],

        autoConnect: true,
      }
    : {};
