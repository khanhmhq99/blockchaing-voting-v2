import { createPublicClient, createWalletClient, custom, defineChain, type EIP1193Provider } from 'viem';

export function injectedProvider(): EIP1193Provider {
  const provider = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error('Cần MetaMask để sử dụng MVP 1.');
  return provider;
}

export async function connectWallet(chainId: number) {
  const transport = custom(injectedProvider());
  const chain = defineChain({ id: chainId, name: 'Configured election network', nativeCurrency: { name: 'Test Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [] } } });
  const client = createWalletClient({ transport, chain });
  if (await client.getChainId() !== chainId) throw new Error(`Chọn mạng có chain ID ${chainId} trong ví.`);
  const [address] = await client.requestAddresses();
  if (!address) throw new Error('Không có tài khoản ví.');
  return { client, address, reader: createPublicClient({ transport, pollingInterval: 1000 }) };
}
