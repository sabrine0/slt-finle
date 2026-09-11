import {
  OverrideAction,
  OverrideReasonCode,
  OverrideResult,
} from '../database/entities';

export interface OverrideCommandResponse {
  id: string;
  intersectionCode: string;
  action: OverrideAction;
  reasonCode: OverrideReasonCode;
  note: string | null;
  result: OverrideResult;
  durationSeconds: number | null;
  issuedAt: string;
  expiresAt: string | null;
  operatorUserId: string | null;
}

export const overrideReasonLabels: Record<OverrideReasonCode, string> = {
  incident: 'Incident response',
  emergency_vehicle: 'Emergency vehicle priority',
  congestion_relief: 'Congestion relief',
  maintenance: 'Maintenance',
  event: 'Event / planned operation',
  pedestrian_safety: 'Pedestrian safety',
  fault_recovery: 'Fault recovery',
  drill: 'Drill / exercise',
  other: 'Other (see note)',
};
