import { Inject, Injectable } from '@nestjs/common';
import { createWalletClient, decodeFunctionData, encodeFunctionData, http, keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { gaslessAbi } from '../../../../packages/contracts/src/gasless-abi.js';
import { intentMessage, type VotingIntent } from '../../../../packages/shared-types/src/gasless.js';
import { ChainService } from '../chain.js';
import { relayerConfig } from './config.js';
import { RelayError } from './errors.js';

@Injectable()
export class TransactionSender {
  constructor(@Inject(ChainService) readonly chain: ChainService) {}
  private account() {
    const key = process.env.RELAYER_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new RelayError('RELAYER_NOT_CONFIGURED', 503);
    try { return privateKeyToAccount(key as Hex); } catch { throw new RelayError('RELAYER_NOT_CONFIGURED', 503); }
  }
  address() { return this.account().address.toLowerCase(); }
  async prepare(intent: VotingIntent, signature: Hex) {
    const account = this.account();
    const config = relayerConfig();
    await this.chain.verifyNetwork();
    if (account.address.toLowerCase() === (await this.chain.owner()).toLowerCase()) throw new RelayError('RELAYER_ADMIN_KEY_REUSE', 503);
    const data = encodeFunctionData({ abi: gaslessAbi, functionName: 'voteWithSignature', args: [intentMessage(intent), signature] });
    const gasEstimate = await this.chain.client.estimateGas({ account, to: this.chain.address, data });
    const gas = (gasEstimate * 120n + 99n) / 100n;
    if (gas > BigInt(config.gasLimit)) throw new RelayError('GAS_LIMIT_EXCEEDED');
    const gasPrice = await this.chain.client.getGasPrice();
    if (gasPrice > BigInt(config.gasPriceWei)) throw new RelayError('GAS_PRICE_EXCEEDED', 503);
    const reserve = gas * gasPrice;
    const balance = await this.chain.client.getBalance({ address: account.address });
    if (balance < reserve + BigInt(config.minimumBalanceWei)) throw new RelayError('RELAYER_BALANCE_LOW', 503);
    const nonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'pending' });
    const latest = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' });
    if (latest !== nonce) throw new RelayError('EXTERNAL_PENDING_TRANSACTION', 503);
    const rawTransaction = await account.signTransaction({ chainId: this.chain.config.CHAIN_ID, type: 'legacy', to: this.chain.address, data, value: 0n, gas, gasPrice, nonce });
    return { transactionHash: keccak256(rawTransaction), rawTransaction, calldataHash: keccak256(data), nonce, gasLimit: gas.toString(), gasPrice: gasPrice.toString(), reservedFeeWei: reserve.toString() };
  }
  async broadcast(raw: Hex) {
    await this.chain.verifyNetwork();
    const transaction = parseTransaction(raw);
    const from = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
    if (from.toLowerCase() !== this.address() || transaction.chainId !== this.chain.config.CHAIN_ID || transaction.to?.toLowerCase() !== this.chain.address || (transaction.value ?? 0n) !== 0n || !transaction.data) throw new RelayError('STORED_TRANSACTION_MISMATCH', 503);
    const call = decodeFunctionData({ abi: gaslessAbi, data: transaction.data });
    if (call.functionName !== 'voteWithSignature') throw new RelayError('STORED_TRANSACTION_MISMATCH', 503);
    return createWalletClient({ transport: http(this.chain.config.RPC_URL, { timeout: 10000, retryCount: 0 }) }).sendRawTransaction({ serializedTransaction: raw });
  }
}
