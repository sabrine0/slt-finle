import { Body, Controller, Get, Post, Req } from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from './types/authenticated-user';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshTokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @AuditAction({
    action: 'auth.login',
    resourceType: 'auth-session',
  })
  @Post('login')
  login(@Body() loginDto: LoginDto, @Req() request: RequestContextRequest) {
    return this.authService.login(loginDto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Public()
  @AuditAction({
    action: 'auth.refresh',
    resourceType: 'auth-session',
  })
  @Post('refresh')
  refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Req() request: RequestContextRequest,
  ) {
    return this.authService.refresh(refreshTokenDto.refreshToken, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });
  }

  @Public()
  @AuditAction({
    action: 'auth.logout',
    resourceType: 'auth-session',
  })
  @Post('logout')
  logout(@Body() logoutDto: LogoutDto) {
    return this.authService.logout(logoutDto.refreshToken);
  }

  @Get('profile')
  getProfile(@CurrentUser() user?: AuthenticatedRequestUser) {
    if (!user) {
      return null;
    }

    return this.authService.getProfile(user);
  }
}

interface RequestContextRequest {
  ip?: string;
  headers: Record<string, string | undefined>;
}
