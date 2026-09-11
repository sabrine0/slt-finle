import { Body, Controller, Post } from '@nestjs/common';

import { DevPublic } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RunPredictionDto } from './prediction.dto';
import { PredictionService } from './prediction.service';

@DevPublic()
@Controller('prediction')
export class PredictionController {
  constructor(private readonly prediction: PredictionService) {}

  @RequirePermissions('command-platform.read')
  @Post('run')
  run(@Body() body: RunPredictionDto) {
    return this.prediction.run(body.carrefourId, body.horizon);
  }
}
