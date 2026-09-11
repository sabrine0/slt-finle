import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CreateUserDto } from './dto/security.dto';
import { SecurityService } from './security.service';

@Controller('security')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @RequirePermissions('users.manage')
  @Get('users')
  listUsers() {
    return this.securityService.listUsers();
  }

  @RequirePermissions('users.manage')
  @AuditAction({
    action: 'security.create-user',
    resourceType: 'user',
  })
  @Post('users')
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.securityService.createUser(createUserDto);
  }

  @RequirePermissions('roles.manage')
  @Get('roles')
  listRoles() {
    return this.securityService.listRoles();
  }

  @RequirePermissions('roles.manage')
  @Get('permissions')
  listPermissions() {
    return this.securityService.listPermissions();
  }

  @RequirePermissions('audit.read')
  @Get('audit-logs')
  listAuditLogs(@Query('limit') limit?: string) {
    return this.securityService.listAuditLogs(limit ? Number(limit) : 100);
  }
}
