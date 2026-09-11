import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ControllerManagerService } from './controller-manager.service';
import {
  ControllerInventoryQueryDto,
  IssueControllerCredentialDto,
  RegisterControllerDto,
  UpdateManagedControllerDto,
} from './dto/controller-manager.dto';

@Controller('controller-manager')
@RequirePermissions('engineering.read')
export class ControllerManagerController {
  constructor(
    private readonly controllerManagerService: ControllerManagerService,
  ) {}

  @Get('runtime-contract')
  getRuntimeContractSchema() {
    return this.controllerManagerService.getRuntimeContractSchema();
  }

  @Get('controllers')
  listControllers(@Query() query: ControllerInventoryQueryDto) {
    return this.controllerManagerService.listControllers(query.intersectionId);
  }

  @Get('controllers/:controllerId')
  getController(@Param('controllerId') controllerId: string) {
    return this.controllerManagerService.getController(controllerId);
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'controller-manager.register-controller',
    resourceType: 'controller',
  })
  @Post('controllers')
  registerController(@Body() registerControllerDto: RegisterControllerDto) {
    return this.controllerManagerService.registerController(
      registerControllerDto,
    );
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'controller-manager.update-controller',
    resourceType: 'controller',
    resourceIdParam: 'controllerId',
  })
  @Patch('controllers/:controllerId')
  updateController(
    @Param('controllerId') controllerId: string,
    @Body() updateControllerDto: UpdateManagedControllerDto,
  ) {
    return this.controllerManagerService.updateController(
      controllerId,
      updateControllerDto,
    );
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'controller-manager.issue-credential',
    resourceType: 'controller',
    resourceIdParam: 'controllerId',
  })
  @Post('controllers/:controllerId/credentials')
  issueCredential(
    @Param('controllerId') controllerId: string,
    @Body() issueCredentialDto: IssueControllerCredentialDto,
  ) {
    return this.controllerManagerService.issueCredential(
      controllerId,
      issueCredentialDto,
    );
  }

  // FK behaviour at the DB level handles the cleanup:
  //   credentials, runtime events  → ON DELETE CASCADE
  //   detectors, alarms, events,
  //   deployments, engineering doc,
  //   programme packages, traffic graph → ON DELETE SET NULL
  // So a plain controllerRepository.delete() is enough.
  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'controller-manager.delete-controller',
    resourceType: 'controller',
    resourceIdParam: 'controllerId',
  })
  @HttpCode(204)
  @Delete('controllers/:controllerId')
  async deleteController(@Param('controllerId') controllerId: string) {
    await this.controllerManagerService.deleteController(controllerId);
  }
}
