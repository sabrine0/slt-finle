import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { AuditAction } from '../audit/audit-action.decorator';
import type { AuthenticatedRequestUser } from '../auth/types/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DevPublic } from '../common/decorators/public.decorator';
import {
  CreateControllerDto,
  CreateDeploymentDraftDto,
  CreateDetectorDto,
  CreateIntersectionDto,
  CreatePhaseDto,
  CreateScenarioDto,
  CreateTimingPlanDto,
  UpdateControllerDto,
  UpdateDeploymentDraftDto,
  UpdateDetectorDto,
  UpdateIntersectionDto,
  UpdatePhaseDto,
  UpdateScenarioDto,
  UpdateTimingPlanDto,
} from './dto/engineering.dto';
import { EngineeringService } from './engineering.service';

@Controller('engineering')
@DevPublic()
@RequirePermissions('engineering.read')
export class EngineeringController {
  constructor(private readonly engineeringService: EngineeringService) {}

  @Get('intersections')
  listIntersections() {
    return this.engineeringService.listIntersections();
  }

  @Get('intersections/:intersectionId')
  getIntersection(@Param('intersectionId') intersectionId: string) {
    return this.engineeringService.getIntersection(intersectionId);
  }

  @RequirePermissions('intersections.manage')
  @AuditAction({
    action: 'engineering.create-intersection',
    resourceType: 'intersection',
  })
  @Post('intersections')
  createIntersection(@Body() createIntersectionDto: CreateIntersectionDto) {
    return this.engineeringService.createIntersection(createIntersectionDto);
  }

  @RequirePermissions('intersections.manage')
  @AuditAction({
    action: 'engineering.update-intersection',
    resourceType: 'intersection',
    resourceIdParam: 'intersectionId',
  })
  @Patch('intersections/:intersectionId')
  updateIntersection(
    @Param('intersectionId') intersectionId: string,
    @Body() updateIntersectionDto: UpdateIntersectionDto,
  ) {
    return this.engineeringService.updateIntersection(
      intersectionId,
      updateIntersectionDto,
    );
  }

  @RequirePermissions('intersections.manage')
  @AuditAction({
    action: 'engineering.delete-intersection',
    resourceType: 'intersection',
    resourceIdParam: 'intersectionId',
  })
  @Delete('intersections/:intersectionId')
  deleteIntersection(@Param('intersectionId') intersectionId: string) {
    return this.engineeringService.deleteIntersection(intersectionId);
  }

  @Get('controllers')
  listControllers(@Query('intersectionId') intersectionId?: string) {
    return this.engineeringService.listControllers(intersectionId);
  }

  @Get('controllers/:controllerId')
  getController(@Param('controllerId') controllerId: string) {
    return this.engineeringService.getController(controllerId);
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'engineering.create-controller',
    resourceType: 'controller',
  })
  @Post('controllers')
  createController(@Body() createControllerDto: CreateControllerDto) {
    return this.engineeringService.createController(createControllerDto);
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'engineering.update-controller',
    resourceType: 'controller',
    resourceIdParam: 'controllerId',
  })
  @Patch('controllers/:controllerId')
  updateController(
    @Param('controllerId') controllerId: string,
    @Body() updateControllerDto: UpdateControllerDto,
  ) {
    return this.engineeringService.updateController(
      controllerId,
      updateControllerDto,
    );
  }

  @RequirePermissions('controllers.manage')
  @AuditAction({
    action: 'engineering.delete-controller',
    resourceType: 'controller',
    resourceIdParam: 'controllerId',
  })
  @Delete('controllers/:controllerId')
  deleteController(@Param('controllerId') controllerId: string) {
    return this.engineeringService.deleteController(controllerId);
  }

  @Get('detectors')
  listDetectors(@Query('intersectionId') intersectionId?: string) {
    return this.engineeringService.listDetectors(intersectionId);
  }

  @Get('detectors/:detectorId')
  getDetector(@Param('detectorId') detectorId: string) {
    return this.engineeringService.getDetector(detectorId);
  }

  @RequirePermissions('detectors.manage')
  @AuditAction({
    action: 'engineering.create-detector',
    resourceType: 'detector',
  })
  @Post('detectors')
  createDetector(@Body() createDetectorDto: CreateDetectorDto) {
    return this.engineeringService.createDetector(createDetectorDto);
  }

  @RequirePermissions('detectors.manage')
  @AuditAction({
    action: 'engineering.update-detector',
    resourceType: 'detector',
    resourceIdParam: 'detectorId',
  })
  @Patch('detectors/:detectorId')
  updateDetector(
    @Param('detectorId') detectorId: string,
    @Body() updateDetectorDto: UpdateDetectorDto,
  ) {
    return this.engineeringService.updateDetector(
      detectorId,
      updateDetectorDto,
    );
  }

  @RequirePermissions('detectors.manage')
  @AuditAction({
    action: 'engineering.delete-detector',
    resourceType: 'detector',
    resourceIdParam: 'detectorId',
  })
  @Delete('detectors/:detectorId')
  deleteDetector(@Param('detectorId') detectorId: string) {
    return this.engineeringService.deleteDetector(detectorId);
  }

  @Get('phases')
  listPhases(@Query('intersectionId') intersectionId?: string) {
    return this.engineeringService.listPhases(intersectionId);
  }

  @Get('phases/:phaseId')
  getPhase(@Param('phaseId') phaseId: string) {
    return this.engineeringService.getPhase(phaseId);
  }

  @RequirePermissions('phases.manage')
  @AuditAction({
    action: 'engineering.create-phase',
    resourceType: 'phase',
  })
  @Post('phases')
  createPhase(@Body() createPhaseDto: CreatePhaseDto) {
    return this.engineeringService.createPhase(createPhaseDto);
  }

  @RequirePermissions('phases.manage')
  @AuditAction({
    action: 'engineering.update-phase',
    resourceType: 'phase',
    resourceIdParam: 'phaseId',
  })
  @Patch('phases/:phaseId')
  updatePhase(
    @Param('phaseId') phaseId: string,
    @Body() updatePhaseDto: UpdatePhaseDto,
  ) {
    return this.engineeringService.updatePhase(phaseId, updatePhaseDto);
  }

  @RequirePermissions('phases.manage')
  @AuditAction({
    action: 'engineering.delete-phase',
    resourceType: 'phase',
    resourceIdParam: 'phaseId',
  })
  @Delete('phases/:phaseId')
  deletePhase(@Param('phaseId') phaseId: string) {
    return this.engineeringService.deletePhase(phaseId);
  }

  @Get('timing-plans')
  listTimingPlans(@Query('intersectionId') intersectionId?: string) {
    return this.engineeringService.listTimingPlans(intersectionId);
  }

  @Get('timing-plans/:timingPlanId')
  getTimingPlan(@Param('timingPlanId') timingPlanId: string) {
    return this.engineeringService.getTimingPlan(timingPlanId);
  }

  @RequirePermissions('timing-plans.manage')
  @AuditAction({
    action: 'engineering.create-timing-plan',
    resourceType: 'timing-plan',
  })
  @Post('timing-plans')
  createTimingPlan(@Body() createTimingPlanDto: CreateTimingPlanDto) {
    return this.engineeringService.createTimingPlan(createTimingPlanDto);
  }

  @RequirePermissions('timing-plans.manage')
  @AuditAction({
    action: 'engineering.update-timing-plan',
    resourceType: 'timing-plan',
    resourceIdParam: 'timingPlanId',
  })
  @Patch('timing-plans/:timingPlanId')
  updateTimingPlan(
    @Param('timingPlanId') timingPlanId: string,
    @Body() updateTimingPlanDto: UpdateTimingPlanDto,
  ) {
    return this.engineeringService.updateTimingPlan(
      timingPlanId,
      updateTimingPlanDto,
    );
  }

  @RequirePermissions('timing-plans.manage')
  @AuditAction({
    action: 'engineering.delete-timing-plan',
    resourceType: 'timing-plan',
    resourceIdParam: 'timingPlanId',
  })
  @Delete('timing-plans/:timingPlanId')
  deleteTimingPlan(@Param('timingPlanId') timingPlanId: string) {
    return this.engineeringService.deleteTimingPlan(timingPlanId);
  }

  @Get('scenarios')
  listScenarios() {
    return this.engineeringService.listScenarios();
  }

  @Get('scenarios/:scenarioId')
  getScenario(@Param('scenarioId') scenarioId: string) {
    return this.engineeringService.getScenario(scenarioId);
  }

  @RequirePermissions('scenarios.manage')
  @AuditAction({
    action: 'engineering.create-scenario',
    resourceType: 'scenario',
  })
  @Post('scenarios')
  createScenario(@Body() createScenarioDto: CreateScenarioDto) {
    return this.engineeringService.createScenario(createScenarioDto);
  }

  @RequirePermissions('scenarios.manage')
  @AuditAction({
    action: 'engineering.update-scenario',
    resourceType: 'scenario',
    resourceIdParam: 'scenarioId',
  })
  @Patch('scenarios/:scenarioId')
  updateScenario(
    @Param('scenarioId') scenarioId: string,
    @Body() updateScenarioDto: UpdateScenarioDto,
  ) {
    return this.engineeringService.updateScenario(
      scenarioId,
      updateScenarioDto,
    );
  }

  @RequirePermissions('scenarios.manage')
  @AuditAction({
    action: 'engineering.delete-scenario',
    resourceType: 'scenario',
    resourceIdParam: 'scenarioId',
  })
  @Delete('scenarios/:scenarioId')
  deleteScenario(@Param('scenarioId') scenarioId: string) {
    return this.engineeringService.deleteScenario(scenarioId);
  }

  @Get('deployments')
  listDeployments(@Query('intersectionId') intersectionId?: string) {
    return this.engineeringService.listDeployments(intersectionId);
  }

  @Get('deployments/:deploymentId')
  getDeployment(@Param('deploymentId') deploymentId: string) {
    return this.engineeringService.getDeployment(deploymentId);
  }

  @RequirePermissions('deployments.manage')
  @AuditAction({
    action: 'engineering.create-deployment-draft',
    resourceType: 'deployment',
  })
  @Post('deployments/drafts')
  createDeploymentDraft(
    @Body() createDeploymentDto: CreateDeploymentDraftDto,
    @CurrentUser() user?: AuthenticatedRequestUser,
  ) {
    return this.engineeringService.createDeploymentDraft(
      createDeploymentDto,
      user,
    );
  }

  @RequirePermissions('deployments.manage')
  @AuditAction({
    action: 'engineering.update-deployment-draft',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Patch('deployments/:deploymentId')
  updateDeploymentDraft(
    @Param('deploymentId') deploymentId: string,
    @Body() updateDeploymentDto: UpdateDeploymentDraftDto,
  ) {
    return this.engineeringService.updateDeploymentDraft(
      deploymentId,
      updateDeploymentDto,
    );
  }

  @RequirePermissions('deployments.manage')
  @AuditAction({
    action: 'engineering.delete-deployment',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Delete('deployments/:deploymentId')
  deleteDeployment(@Param('deploymentId') deploymentId: string) {
    return this.engineeringService.deleteDeployment(deploymentId);
  }

  @RequirePermissions('deployments.validate')
  @AuditAction({
    action: 'engineering.validate-deployment',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Post('deployments/:deploymentId/validate')
  validateDeployment(@Param('deploymentId') deploymentId: string) {
    return this.engineeringService.validateDeployment(deploymentId);
  }

  @RequirePermissions('deployments.sign')
  @AuditAction({
    action: 'engineering.sign-deployment',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Post('deployments/:deploymentId/sign')
  signDeployment(@Param('deploymentId') deploymentId: string) {
    return this.engineeringService.signDeployment(deploymentId);
  }

  @RequirePermissions('deployments.publish')
  @AuditAction({
    action: 'engineering.publish-deployment',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Post('deployments/:deploymentId/publish')
  publishDeployment(
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user?: AuthenticatedRequestUser,
  ) {
    return this.engineeringService.publishDeployment(deploymentId, user);
  }

  @RequirePermissions('deployments.rollback')
  @AuditAction({
    action: 'engineering.rollback-deployment',
    resourceType: 'deployment',
    resourceIdParam: 'deploymentId',
  })
  @Post('deployments/:deploymentId/rollback')
  rollbackDeployment(
    @Param('deploymentId') deploymentId: string,
    @CurrentUser() user?: AuthenticatedRequestUser,
  ) {
    return this.engineeringService.rollbackDeployment(deploymentId, user);
  }
}
