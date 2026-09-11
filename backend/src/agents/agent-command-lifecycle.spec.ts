import { AgentsController } from './agents.controller';
import type { AgentEventBusService } from './agent-event-bus.service';
import type { AgentRegistryService } from './agent-registry.service';
import type { AgentRunsService } from './agent-runs.service';
import type { AgentRuntimeService } from './agent-runtime.service';
import type { AgentRunResult } from './agent.types';
import type { TrafficControlExecutionService } from '../traffic-control/traffic-control-execution.service';

const NOW = new Date('2026-05-07T10:00:00.000Z').toISOString();

function makeRun(): AgentRunResult {
  return {
    scope: 'intersection',
    scopeRef: 'INT-CAS-001',
    horizon: 'H+15',
    generatedAt: NOW,
    durationMs: 12,
    agentCount: 1,
    outputs: [
      {
        agentId: 'emergency-vehicle',
        agentType: 'preemption',
        scope: 'intersection',
        scopeRef: 'INT-CAS-001',
        status: 'success',
        startedAt: NOW,
        finishedAt: NOW,
        durationMs: 5,
        decision: {
          kind: 'force_green_corridor',
          severity: 'critical',
          rationale: ['Emergency vehicle inbound.'],
          payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
          override: true,
        },
      },
    ],
    decisions: [
      {
        kind: 'force_green_corridor',
        severity: 'critical',
        rationale: ['Emergency vehicle inbound.'],
        payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
        override: true,
      },
    ],
    aggregatedSeverity: 'critical',
    finalRecommendation: {
      kind: 'force_green_corridor',
      severity: 'critical',
      rationale: ['Emergency vehicle inbound.'],
      payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
      override: true,
    },
  };
}

function buildController() {
  const result = makeRun();
  const runtime = {
    execute: jest.fn(() => Promise.resolve(result)),
  } as unknown as AgentRuntimeService;
  const registry = {
    list: jest.fn(() => []),
  } as unknown as AgentRegistryService;
  const runs = {
    record: jest.fn(() =>
      Promise.resolve({
        ...result,
        id: 'run-001',
        trigger: 'manual',
        persistedAt: NOW,
      }),
    ),
  } as unknown as AgentRunsService;
  const events = {
    publishRun: jest.fn(),
  } as unknown as AgentEventBusService;
  const executeMock = jest.fn(() =>
    Promise.resolve([
      {
        id: 'cmd-001',
        intersectionCode: 'INT-CAS-001',
        scope: 'intersection',
        scopeRef: 'INT-CAS-001',
        agentRunId: 'run-001',
        agentId: 'emergency-vehicle',
        decisionKind: 'force_green_corridor',
        kind: 'force_phase',
        severity: 'critical',
        override: true,
        status: 'queued',
        lifecycleStage: 'queued',
        payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
        rationale: ['Emergency vehicle inbound.'],
        issuedAt: NOW,
        resolvedAt: null,
        resolutionNote: null,
      },
    ]),
  );
  const waitForSettlementMock = jest.fn(() =>
    Promise.resolve([
      {
        id: 'cmd-001',
        intersectionCode: 'INT-CAS-001',
        scope: 'intersection',
        scopeRef: 'INT-CAS-001',
        agentRunId: 'run-001',
        agentId: 'emergency-vehicle',
        decisionKind: 'force_green_corridor',
        kind: 'force_phase',
        severity: 'critical',
        override: true,
        status: 'acknowledged',
        lifecycleStage: 'applied',
        payload: { direction: 'NORTH', recommendedHoldSeconds: 25 },
        rationale: ['Emergency vehicle inbound.'],
        issuedAt: NOW,
        resolvedAt: NOW,
        resolutionNote: 'mock set active phase',
      },
    ]),
  );
  const execution = {
    execute: executeMock,
    waitForSettlement: waitForSettlementMock,
  } as unknown as TrafficControlExecutionService;

  return {
    controller: new AgentsController(
      runtime,
      registry,
      runs,
      events,
      execution,
    ),
    execution,
    executeMock,
    waitForSettlementMock,
  };
}

describe('AgentsController — command lifecycle visibility', () => {
  it('returns settled command state when awaitCommands=1 is used', async () => {
    const { controller, executeMock, waitForSettlementMock } =
      buildController();

    const response = await controller.runIntersection(
      'INT-CAS-001',
      'H+15',
      'emergency_vehicle',
      '0',
      '1',
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(waitForSettlementMock).toHaveBeenCalledWith(['cmd-001']);
    expect(response.commands[0]?.lifecycleStage).toBe('applied');
    expect(response.commands[0]?.status).toBe('acknowledged');
  });

  it('keeps backward-compatible queued commands when awaitCommands is omitted', async () => {
    const { controller, executeMock, waitForSettlementMock } =
      buildController();

    const response = await controller.runIntersection(
      'INT-CAS-001',
      'H+15',
      'emergency_vehicle',
      '0',
      undefined,
    );

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(waitForSettlementMock).not.toHaveBeenCalled();
    expect(response.commands[0]?.lifecycleStage).toBe('queued');
  });
});
