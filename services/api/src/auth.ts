import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, Inject, Injectable, Post, UnauthorizedException, ForbiddenException, ConflictException, BadRequestException, Module, Param, Res } from '@nestjs/common';
import { hashTypedData, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';
import { RelayerService } from './relayer/service.js';
import { InfrastructureModule } from './infrastructure.js';
import { RelayerModule } from './relayer/module.js';
import { ElectionsService } from './elections.js';
import { gaslessAbi } from '../../../packages/contracts/src/gasless-abi.js';
import { intentSchema, votingTypedData } from '../../../packages/shared-types/src/gasless.js';
import { jsonSafe } from '../../../packages/shared-types/src/index.js';
import type { ElectionVoterIdentity } from '@prisma/client';

const scrypt = (password: string, salt: string, length: number, options: { N?: number; r?: number; p?: number; maxmem?: number } = {}) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key));
});
const sessionCookie = 'hcmut_voting_session';
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
type PublicUser = { id: string; username: string; fullName: string; role: string };

function tokenDigest(token: string) { return createHash('sha256').update(token).digest('hex'); }
async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }) as Buffer;
  return `scrypt$16384$8$1$${salt}$${digest.toString('hex')}`;
}
async function verifyPassword(password: string, encoded: string) {
  try {
    const [algorithm, cost, blockSize, parallelism, salt, digest] = encoded.split('$');
    if (algorithm !== 'scrypt' || cost !== '16384' || blockSize !== '8' || parallelism !== '1' || !salt || !digest) return false;
    const expected = Buffer.from(digest, 'hex');
    const actual = await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }) as Buffer;
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}
function encryptionKey() {
  const configured = process.env.VOTER_KEY_ENCRYPTION_KEY;
  if (!configured || !/^[0-9a-fA-F]{64}$/.test(configured)) throw new Error('VOTER_KEY_ENCRYPTION_KEY must be a 32-byte hex key.');
  return Buffer.from(configured, 'hex');
}
function encryptPrivateKey(privateKey: Hex) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join(':');
}
function decryptPrivateKey(encoded: string): Hex {
  const [ivHex, tagHex, dataHex] = encoded.split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Stored voter key is malformed');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8') as Hex;
}

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, { count: number; until: number }>();
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService, @Inject(RelayerService) private readonly relay: RelayerService, @Inject(ElectionsService) private readonly elections: ElectionsService) {}

  private cookieToken(cookie: string | undefined) {
    const prefix = `${sessionCookie}=`;
    return cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(prefix))?.slice(prefix.length);
  }
  private setCookie(token: string) {
    const secure = process.env.APP_ORIGIN?.startsWith('https://') ? '; Secure' : '';
    return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`;
  }
  async register(body: unknown) {
    const input = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(1024), fullName: z.string().trim().min(1).max(160), email: z.string().trim().email().max(254).optional().or(z.literal('')), phone: z.string().trim().max(40).optional() }).strict().parse(body);
    const usernameKey = input.username.normalize('NFKC').toLocaleLowerCase('en-US');
    try {
      return await this.db.appUser.create({ data: { username: input.username, usernameKey, passwordHash: await hashPassword(input.password), fullName: input.fullName, email: input.email || null, phone: input.phone || null, role: 'USER', status: 'ACTIVE' }, select: { id: true, username: true, fullName: true, role: true } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException({ code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã được sử dụng.' });
      throw error;
    }
  }
  async login(body: unknown) {
    const input = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(1024) }).strict().parse(body);
    const key = input.username.normalize('NFKC').toLocaleLowerCase('en-US');
    const entry = this.loginFailures.get(key);
    if (entry && entry.until > Date.now() && entry.count >= 8) throw new ForbiddenException({ code: 'LOGIN_RATE_LIMITED', message: 'Thử đăng nhập lại sau một phút.' });
    if (this.loginFailures.size > 20_000) for (const [name, value] of this.loginFailures) if (value.until <= Date.now()) this.loginFailures.delete(name);
    if (this.loginFailures.size >= 20_000 && !this.loginFailures.has(key)) throw new ForbiddenException({ code: 'LOGIN_RATE_LIMITED', message: 'Dịch vụ đăng nhập đang bận. Thử lại sau.' });
    const user = await this.db.appUser.findUnique({ where: { usernameKey: key } });
    const passwordValid = user ? await verifyPassword(input.password, user.passwordHash) : await scrypt(input.password, 'hcmut-voting-unknown-user', 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }).then(() => false);
    const valid = !!user && user.status === 'ACTIVE' && passwordValid;
    if (!valid) {
      const next = entry?.until && entry.until > Date.now() ? entry : { count: 0, until: Date.now() + 60_000 };
      next.count++; this.loginFailures.set(key, next);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
    }
    this.loginFailures.delete(key);
    await this.db.appSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const token = randomBytes(32).toString('base64url');
    await this.db.appSession.create({ data: { tokenHash: tokenDigest(token), userId: user.id, expiresAt: new Date(Date.now() + sessionLifetimeMs) } });
    return { user: this.publicUser(user), cookie: this.setCookie(token) };
  }
  async logout(cookie: string | undefined) {
    const token = this.cookieToken(cookie);
    if (token) await this.db.appSession.deleteMany({ where: { tokenHash: tokenDigest(token) } });
  }
  async authenticate(cookie: string | undefined): Promise<PublicUser> {
    const token = this.cookieToken(cookie);
    if (!token || token.length > 128) throw new UnauthorizedException({ code: 'SESSION_REQUIRED', message: 'Vui lòng đăng nhập.' });
    const row = await this.db.appSession.findUnique({ where: { tokenHash: tokenDigest(token) }, include: { user: true } });
    if (!row || row.expiresAt <= new Date() || row.user.status !== 'ACTIVE') throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Phiên đăng nhập đã hết hạn.' });
    return this.publicUser(row.user);
  }
  private publicUser(user: { id: string; username: string; fullName: string; role: string }): PublicUser { return { id: user.id, username: user.username, fullName: user.fullName, role: user.role }; }
  async admin(cookie: string | undefined) { const user = await this.authenticate(cookie); if (user.role !== 'ADMIN') throw new ForbiddenException({ code: 'ADMIN_REQUIRED', message: 'Bạn không có quyền quản trị.' }); return user; }

  async profile(cookie: string | undefined) {
    const user = await this.authenticate(cookie);
    return this.db.appUser.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, username: true, fullName: true, email: true, phone: true, role: true, status: true, createdAt: true } });
  }
  async updateProfile(cookie: string | undefined, body: unknown) {
    const user = await this.authenticate(cookie);
    const input = z.object({ fullName: z.string().trim().min(1).max(160), email: z.email().max(254).optional().or(z.literal('')), phone: z.string().trim().max(40).optional() }).strict().parse(body);
    return this.db.appUser.update({ where: { id: user.id }, data: { fullName: input.fullName, email: input.email || null, phone: input.phone || null }, select: { id: true, username: true, fullName: true, email: true, phone: true, role: true, status: true, createdAt: true } });
  }
  async changePassword(cookie: string | undefined, body: unknown) {
    const user = await this.authenticate(cookie);
    const input = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1).max(1024) }).strict().parse(body);
    const row = await this.db.appUser.findUniqueOrThrow({ where: { id: user.id } });
    if (!await verifyPassword(input.currentPassword, row.passwordHash)) throw new ForbiddenException({ code: 'INVALID_PASSWORD', message: 'Mật khẩu hiện tại không đúng.' });
    await this.db.$transaction(async tx => {
      await tx.appUser.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } });
      await tx.appSession.deleteMany({ where: { userId: user.id } });
    });
    return { ok: true };
  }
  async users(cookie: string | undefined) {
    await this.admin(cookie);
    return this.db.appUser.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, username: true, fullName: true, email: true, role: true, status: true, createdAt: true } });
  }
  async createUser(cookie: string | undefined, body: unknown) {
    const actor = await this.admin(cookie);
    const input = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(1024), fullName: z.string().trim().min(1).max(160), email: z.email().max(254).optional().or(z.literal('')), phone: z.string().trim().max(40).optional(), role: z.enum(['USER', 'ADMIN']).default('USER') }).strict().parse(body);
    const usernameKey = input.username.normalize('NFKC').toLocaleLowerCase('en-US');
    try {
      return await this.db.$transaction(async tx => {
        const row = await tx.appUser.create({ data: { username: input.username, usernameKey, passwordHash: await hashPassword(input.password), fullName: input.fullName, email: input.email || null, phone: input.phone || null, role: input.role }, select: { id: true, username: true, fullName: true, email: true, role: true, status: true, createdAt: true } });
        await tx.adminActivity.create({ data: { actorId: actor.id, action: 'USER_CREATED', targetId: row.id } });
        return row;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException({ code: 'USERNAME_EXISTS', message: 'Tên đăng nhập đã được sử dụng.' });
      throw error;
    }
  }
  async updateUser(cookie: string | undefined, idInput: string, body: unknown) {
    const actor = await this.admin(cookie);
    const id = z.uuid().parse(idInput);
    const input = z.object({ fullName: z.string().trim().min(1).max(160).optional(), email: z.email().max(254).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), role: z.enum(['USER', 'ADMIN']).optional(), status: z.enum(['ACTIVE', 'INACTIVE', 'DELETED']).optional() }).strict().parse(body);
    if (!Object.keys(input).length) throw new BadRequestException({ code: 'EMPTY_UPDATE', message: 'Chưa có thay đổi.' });
    return this.db.$transaction(async tx => {
      const previous = await tx.appUser.findUnique({ where: { id } });
      if (!previous) throw new BadRequestException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản.' });
      if (actor.id === id && ((input.role && input.role !== 'ADMIN') || (input.status && input.status !== 'ACTIVE'))) throw new ForbiddenException({ code: 'SELF_ADMIN_CHANGE', message: 'Không thể tự hạ quyền hoặc khóa tài khoản quản trị.' });
      if (previous.role === 'ADMIN' && previous.status === 'ACTIVE' && (input.role === 'USER' || input.status === 'INACTIVE' || input.status === 'DELETED')) {
        const count = await tx.appUser.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
        if (count <= 1) throw new ConflictException({ code: 'LAST_ADMIN', message: 'Phải giữ ít nhất một quản trị viên hoạt động.' });
      }
      const data = { ...(input.fullName !== undefined ? { fullName: input.fullName } : {}), ...(input.email !== undefined ? { email: input.email } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}), ...(input.role !== undefined ? { role: input.role } : {}), ...(input.status !== undefined ? { status: input.status } : {}) };
      const row = await tx.appUser.update({ where: { id }, data, select: { id: true, username: true, fullName: true, email: true, role: true, status: true, createdAt: true } });
      if (input.status && input.status !== 'ACTIVE') await tx.appSession.deleteMany({ where: { userId: id } });
      await tx.adminActivity.create({ data: { actorId: actor.id, action: 'USER_UPDATED', targetId: id } });
      return row;
    }, { isolationLevel: 'Serializable' });
  }
  async resetUserPassword(cookie: string | undefined, idInput: string, body: unknown) {
    const actor = await this.admin(cookie);
    const id = z.uuid().parse(idInput);
    const { password } = z.object({ password: z.string().min(1).max(1024) }).strict().parse(body);
    await this.db.$transaction(async tx => {
      await tx.appUser.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
      await tx.appSession.deleteMany({ where: { userId: id } });
      await tx.adminActivity.create({ data: { actorId: actor.id, action: 'PASSWORD_RESET', targetId: id } });
    });
    return { ok: true };
  }
  async activity(cookie: string | undefined) {
    await this.admin(cookie);
    const [accountActions, chainActions] = await Promise.all([
      this.db.adminActivity.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { actor: { select: { username: true, fullName: true } } } }),
      this.db.blockchainTransaction.findMany({ where: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, status: 'success', OR: [{ operation: { contains: 'Election' } }, { operation: { contains: 'VoterAuthorized' } }] }, take: 100, orderBy: { observedAt: 'desc' } }),
    ]);
    const chain = chainActions.map(row => ({ id: row.transactionHash, action: row.operation.split(',').find(name => name.startsWith('Election') || name === 'VoterAuthorized') ?? row.operation, targetId: row.electionId, createdAt: row.observedAt, actor: { username: 'Chủ hợp đồng', fullName: 'Chủ hợp đồng' }, source: 'indexed-chain' }));
    return [...accountActions.map(row => ({ ...row, source: 'admin-audit' })), ...chain].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
  }

  async createIdentity(cookie: string | undefined, electionIdInput: string, body: unknown) {
    await this.admin(cookie);
    const electionId = z.string().regex(/^[1-9]\d{0,19}$/).parse(electionIdInput);
    const { username } = z.object({ username: z.string().trim().min(1).max(64) }).strict().parse(body);
    const usernameKey = username.normalize('NFKC').toLocaleLowerCase('en-US');
    const user = await this.db.appUser.findUnique({ where: { usernameKey } });
    if (!user || user.status !== 'ACTIVE') throw new BadRequestException({ code: 'USER_NOT_FOUND', message: 'Không tìm thấy tài khoản đang hoạt động.' });
    const election = await this.chain.election(BigInt(electionId));
    if (election.state !== 'Draft') throw new BadRequestException({ code: 'ELECTION_NOT_DRAFT', message: 'Chỉ có thể cấp danh tính trước khi khóa cấu hình cuộc bầu cử.' });
    const scope = { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, electionId, userId: user.id };
    const old = await this.db.electionVoterIdentity.findUnique({ where: { chainId_contractAddress_electionId_userId: scope } });
    if (old) return { username: user.username, voterAddress: old.voterAddress, status: old.status, alreadyAssigned: true };
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    let row: ElectionVoterIdentity;
    try {
      row = await this.db.electionVoterIdentity.create({ data: { ...scope, voterAddress: account.address.toLowerCase(), encryptedKey: encryptPrivateKey(privateKey) } });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')) throw error;
      const concurrent = await this.db.electionVoterIdentity.findUnique({ where: { chainId_contractAddress_electionId_userId: scope } });
      if (!concurrent) throw error;
      return { username: user.username, voterAddress: concurrent.voterAddress, status: concurrent.status, alreadyAssigned: true };
    }
    await this.db.adminActivity.create({ data: { actorId: (await this.admin(cookie)).id, action: 'ELIGIBILITY_IDENTITY_ASSIGNED', targetId: electionId } });
    return { username: user.username, voterAddress: row.voterAddress, status: row.status, alreadyAssigned: false };
  }
  async identities(cookie: string | undefined, electionId: string) {
    await this.admin(cookie);
    return this.db.electionVoterIdentity.findMany({ where: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, electionId }, include: { user: { select: { username: true, fullName: true } } }, orderBy: { createdAt: 'asc' } }).then(rows => rows.map(({ encryptedKey, ...safe }) => { void encryptedKey; return safe; }));
  }
  async electionList(cookie: string | undefined) {
    const user = await this.authenticate(cookie);
    const [elections, identities] = await Promise.all([
      this.elections.list(),
      this.db.electionVoterIdentity.findMany({ where: { userId: user.id, chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, status: 'ACTIVE' }, select: { electionId: true, voterAddress: true } }),
    ]);
    const byElection = new Map(identities.map(identity => [identity.electionId, identity.voterAddress as Address]));
    return Promise.all(elections.map(async election => {
      const voter = byElection.get(election.chain.id);
      const personalized = voter ? await this.elections.get(election.chain.id, voter) : election;
      return { ...personalized, userEligible: !!voter && !!personalized.chain.eligible, userHasVoted: !!voter && !!personalized.chain.hasVoted };
    }));
  }
  async history(cookie: string | undefined) {
    const user = await this.authenticate(cookie);
    const identities = await this.db.electionVoterIdentity.findMany({ where: { userId: user.id, chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address }, select: { electionId: true, voterAddress: true } });
    const byAddress = new Map(identities.map(identity => [identity.voterAddress.toLowerCase(), identity.electionId]));
    if (!byAddress.size) return [];
    const rows = await this.db.gaslessVoteRequest.findMany({ where: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, voterAddress: { in: [...byAddress.keys()] } }, include: { transaction: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return Promise.all(rows.map(async (row, index) => {
      const current = index < 10 ? await this.relay.status(row.id).catch(() => null) : null;
      return { id: row.id, electionId: byAddress.get(row.voterAddress.toLowerCase()), status: index < 10 && !current ? 'UNAVAILABLE' : current?.status ?? row.status, transactionHash: current?.transactionHash ?? row.transaction?.transactionHash ?? null, createdAt: row.createdAt, confirmedAt: current?.confirmedAt ?? row.confirmedAt, errorCode: current?.errorCode ?? row.errorCode };
    }));
  }
  async vote(cookie: string | undefined, electionIdInput: string, body: unknown) {
    const user = await this.authenticate(cookie);
    const { candidateId } = z.object({ candidateId: z.number().int().min(0).max(99) }).strict().parse(body);
    const electionId = z.string().regex(/^[1-9]\d{0,19}$/).parse(electionIdInput);
    const identity = await this.db.electionVoterIdentity.findUnique({ where: { chainId_contractAddress_electionId_userId: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address, electionId, userId: user.id } } });
    if (!identity || identity.status !== 'ACTIVE') throw new ForbiddenException({ code: 'VOTING_IDENTITY_NOT_ASSIGNED', message: 'Bạn chưa được cấp quyền tham gia cuộc bầu cử này.' });
    const election = await this.chain.election(BigInt(electionId), identity.voterAddress as Address);
    if (!election.eligible) throw new ForbiddenException({ code: 'VOTER_NOT_ELIGIBLE', message: 'Tài khoản này chưa được cấp quyền trên cuộc bầu cử.' });
    if (election.hasVoted) throw new ConflictException({ code: 'ALREADY_VOTED', message: 'Phiếu của bạn đã được ghi nhận.' });
    const nonce = await this.chain.client.readContract({ address: this.chain.address, abi: gaslessAbi, functionName: 'nonces', args: [BigInt(electionId), identity.voterAddress as Address] });
    const block = await this.chain.client.getBlock();
    const intent = intentSchema.parse({ electionId, manifestHash: election.manifestHash, candidateId: String(candidateId), voter: identity.voterAddress, nonce: nonce.toString(), deadline: (block.timestamp + 120n).toString() });
    const account = privateKeyToAccount(decryptPrivateKey(identity.encryptedKey));
    if (account.address.toLowerCase() !== identity.voterAddress.toLowerCase()) throw new Error('Managed voting identity key mismatch');
    const signature = await account.signTypedData(votingTypedData(intent, this.chain.config.CHAIN_ID, this.chain.address)) as Hex;
    const intentHash = hashTypedData(votingTypedData(intent, this.chain.config.CHAIN_ID, this.chain.address));
    const status = await this.relay.submit({ intent, signature }, intentHash);
    return { ...status, electionId, submittedBy: 'server-managed-election-identity' };
  }
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('register') register(@Body() body: unknown) { return this.auth.register(body); }
  @Post('login') async login(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    const result = await this.auth.login(body); response.setHeader('Set-Cookie', result.cookie); return { user: result.user };
  }
  @Post('logout') async logout(@Headers('cookie') cookie: string | undefined, @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }) {
    await this.auth.logout(cookie); const secure = process.env.APP_ORIGIN?.startsWith('https://') ? '; Secure' : ''; response.setHeader('Set-Cookie', `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`); return { ok: true };
  }
  @Get('me') async me(@Headers('cookie') cookie: string | undefined) { return this.auth.authenticate(cookie); }
  @Get('profile') profile(@Headers('cookie') cookie: string | undefined) { return this.auth.profile(cookie); }
  @Post('profile') updateProfile(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) { return this.auth.updateProfile(cookie, body); }
  @Post('password') changePassword(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) { return this.auth.changePassword(cookie, body); }
  @Get('admin/users') users(@Headers('cookie') cookie: string | undefined) { return this.auth.users(cookie); }
  @Post('admin/users') createUser(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) { return this.auth.createUser(cookie, body); }
  @Post('admin/users/:id') updateUser(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.auth.updateUser(cookie, id, body); }
  @Post('admin/users/:id/password') resetUserPassword(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.auth.resetUserPassword(cookie, id, body); }
  @Get('admin/activity') activity(@Headers('cookie') cookie: string | undefined) { return this.auth.activity(cookie); }
  @Get('elections') async elections(@Headers('cookie') cookie: string | undefined) { return jsonSafe(await this.auth.electionList(cookie)); }
  @Get('history') history(@Headers('cookie') cookie: string | undefined) { return this.auth.history(cookie); }
  @Post('admin/elections/:id/identities') assign(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.auth.createIdentity(cookie, id, body); }
  @Get('admin/elections/:id/identities') identities(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return this.auth.identities(cookie, id); }
  @Post('elections/:id/vote') vote(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.auth.vote(cookie, id, body); }
}
@Module({ imports: [InfrastructureModule, RelayerModule], controllers: [AuthController], providers: [ElectionsService, AuthService] })
export class AuthModule {}
