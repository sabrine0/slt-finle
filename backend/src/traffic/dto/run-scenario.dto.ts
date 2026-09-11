import { IsIn } from 'class-validator';

import type { ScenarioId } from '../traffic.types';

const scenarioIds = ['normal_traffic', 'peak_traffic', 'emergency'] as const;

export class RunScenarioDto {
  @IsIn(scenarioIds)
  scenarioId!: ScenarioId;
}
