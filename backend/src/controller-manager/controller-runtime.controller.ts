import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../common/decorators/public.decorator';
import { CurrentController } from './decorators/current-controller.decorator';
import { ControllerManagerService } from './controller-manager.service';
import {
  ControllerAcknowledgeDeploymentDto,
  ControllerAlarmUploadDto,
  ControllerBootstrapDto,
  ControllerHeartbeatDto,
  ControllerTelemetryUploadDto,
} from './dto/controller-manager.dto';
import { ControllerRuntimeGuard } from './guards/controller-runtime.guard';
import type { AuthenticatedController } from './types/authenticated-controller';

@Controller('controller-runtime')
@Public()
export class ControllerRuntimeController {
  constructor(
    private readonly controllerManagerService: ControllerManagerService,
  ) {}

  @Post('bootstrap')
  bootstrapController(
    @Body() bootstrapDto: ControllerBootstrapDto,
    @Req() request: Request,
  ) {
    return this.controllerManagerService.bootstrapController(bootstrapDto, {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });
  }

  @UseGuards(ControllerRuntimeGuard)
  @Get('packages/latest')
  fetchLatestPackage(@CurrentController() controller: AuthenticatedController) {
    return this.controllerManagerService.fetchLatestPackage(controller);
  }

  @UseGuards(ControllerRuntimeGuard)
  @Post('deployments/:deploymentId/acknowledge')
  acknowledgeDeployment(
    @CurrentController() controller: AuthenticatedController,
    @Param('deploymentId') deploymentId: string,
    @Body() acknowledgeDto: ControllerAcknowledgeDeploymentDto,
  ) {
    return this.controllerManagerService.acknowledgeDeployment(
      controller,
      deploymentId,
      acknowledgeDto,
    );
  }

  @UseGuards(ControllerRuntimeGuard)
  @Post('heartbeat')
  heartbeat(
    @CurrentController() controller: AuthenticatedController,
    @Body() heartbeatDto: ControllerHeartbeatDto,
    @Req() request: Request,
  ) {
    return this.controllerManagerService.recordHeartbeat(
      controller,
      heartbeatDto,
      {
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    );
  }

  @UseGuards(ControllerRuntimeGuard)
  @Post('telemetry')
  uploadTelemetry(
    @CurrentController() controller: AuthenticatedController,
    @Body() telemetryDto: ControllerTelemetryUploadDto,
  ) {
    return this.controllerManagerService.uploadTelemetry(
      controller,
      telemetryDto,
    );
  }

  @UseGuards(ControllerRuntimeGuard)
  @Post('alarms')
  uploadAlarm(
    @CurrentController() controller: AuthenticatedController,
    @Body() alarmDto: ControllerAlarmUploadDto,
  ) {
    return this.controllerManagerService.uploadAlarm(controller, alarmDto);
  }
}
