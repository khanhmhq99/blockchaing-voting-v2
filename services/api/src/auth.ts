import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, Inject, Injectable, Post, UnauthorizedException, ForbiddenException, ConflictException, BadRequestException, Module, Param, Res } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from './database.js';
import { InfrastructureModule } from './infrastructure.js';

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
@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, { count: number; until: number }>();
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

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
    return this.db.adminActivity.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { actor: { select: { username: true, fullName: true } } } });
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

}
@Module({ imports: [InfrastructureModule], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
