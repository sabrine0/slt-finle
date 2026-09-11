import type { Repository } from 'typeorm';

import type {
  AgentDecision,
  AgentOutput,
  AgentRunResult,
} from '../agents/agent.types';
import type { TrafficCommandEntity } from '../database/entities';
import { TrafficControlExecutionService } from './traffic-control-execution.service';

interface FakeRepository {
  create: jest.Mock<
    Partial<TrafficCommandEntity>,
    [Partial<TrafficCommandEntity>]
  >;
  save: jest.Mock<
    Promise<TrafficCommandEntity[]>,
    [Partial<TrafficCommandEntity>[]]
  >;
}

let fakeId = 0;

function makeRepository(): FakeRepository {
  return {
    create: jest.fn((entity) => entity),
    save: jest.fn((rows: Partial<TrafficCommandEntity>[]) =>
      Promise.resolve(
        rows.map(
          (row) =>
            ({
              id: `cmd-${++fakeId}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...row,
              issuedAt:
                row.issuedAt instanceof Date
                  ? row.issuedAt
                  : new Date('2026-01-01T00:00:00.000Z'),
              resolvedAt: null,
              resolutionNote: null,
            }) as TrafficCommandEntity,
        ),
      ),
    ),
  };
}

function makeOutput(
  agentId: string,
  decision: AgentDecision | null,
): AgentOutput {
  return {
    agentId,
    agentType: agentId,
    scope: 'intersection',
    scopeRef: 'INT-CAS-001',
    status: decision ? 'success' : 'skipped',
    decision,
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    finishedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    durationMs: 1,
  };
}

function makeRun(outputs: AgentOutput[]): AgentRunResult {
  const decisions = outputs
    .map((output) => output.decision)
    .filter((decision): decision is AgentDecision => decision != null);
  return {
    scope: 'intersection',
    scopeRef: 'INT-CAS-001',
    horizon: 'H+15',
    generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    durationMs: 1,
    agentCount: outputs.length,
    outputs,
    decisions,
    aggregatedSeverity: 'info',
    finalRecommendation: decisions[0] ?? null,
  };
}

function buildService() {
  const repo = makeRepository();
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const repoWithQb = {
    ...repo,
    createQueryBuilder: jest.fn(() => queryBuilder),
  } as unknown as Repository<TrafficCommandEntity>;
  const service = new TrafficControlExecutionService(repoWithQb);
  return { service, repo, queryBuilder };
}

describe('TrafficControlExecutionService — decision → command mapping', () => {
  it('maps each known decision kind to the right command kind', async () => {
    const { service, repo } = buildService();
    const outputs: AgentOutput[] = [
      makeOutput('bus-priority', {
        kind: 'extend_green',
        severity: 'advisory',
        rationale: ['bus'],
        payload: { direction: 'NORTH', extensionSeconds: 6 },
      }),
      makeOutput('emergency-vehicle', {
        kind: 'force_green_corridor',
        severity: 'critical',
        rationale: ['emergency'],
        payload: { direction: 'EAST', recommendedHoldSeconds: 30 },
        override: true,
      }),
      makeOutput('police-operator', {
        kind: 'manual_control',
        severity: 'critical',
        rationale: ['police'],
        payload: { source: 'event' },
        override: true,
      }),
      makeOutput('intersection-manager', {
        kind: 'extend_cycle',
        severity: 'warning',
        rationale: ['cycle'],
        payload: {
          cycleExtensionSeconds: 20,
          biasFactor: 0.65,
          // These two should be stripped from persisted payload.
          analysis: { foo: 'bar' },
          metricsSummary: { saturation: 0.9 },
        },
      }),
    ];

    const commands = await service.execute(makeRun(outputs), {
      agentRunId: 'run-42',
    });

    const kinds = commands.map((c) => c.kind);
    expect(kinds).toEqual([
      'modify_phase_timing',
      'force_phase',
      'block_automatic_control',
      'modify_phase_timing',
    ]);

    // The intersection-manager command should NOT carry analysis /
    // metricsSummary (cleanPayload strips them).
    const cycleCommand = commands.find(
      (c) => c.decisionKind === 'extend_cycle',
    );
    expect(cycleCommand?.payload).toEqual({
      cycleExtensionSeconds: 20,
      biasFactor: 0.65,
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('skips decisions whose kind is not in the mapping table', async () => {
    const { service, repo } = buildService();
    const outputs: AgentOutput[] = [
      makeOutput('intersection-manager', {
        kind: 'maintain_plan',
        severity: 'info',
        rationale: ['smooth'],
      }),
      makeOutput('intersection-manager', {
        kind: 'monitor_plan',
        severity: 'advisory',
        rationale: ['monitor'],
      }),
    ];

    const commands = await service.execute(makeRun(outputs));

    expect(commands).toEqual([]);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('skips outputs with no decision (status=skipped or failed)', async () => {
    const { service, repo } = buildService();
    const outputs: AgentOutput[] = [
      makeOutput('police-operator', null),
      makeOutput('emergency-vehicle', null),
    ];

    const commands = await service.execute(makeRun(outputs));

    expect(commands).toEqual([]);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('preserves rationale and override flag on the persisted command', async () => {
    const { service } = buildService();
    const decision: AgentDecision = {
      kind: 'manual_control',
      severity: 'critical',
      rationale: ['police took manual control', 'event source: dispatch'],
      payload: {},
      override: true,
    };

    const commands = await service.execute(
      makeRun([makeOutput('police-operator', decision)]),
    );

    expect(commands[0].rationale).toEqual([
      'police took manual control',
      'event source: dispatch',
    ]);
    expect(commands[0].override).toBe(true);
    expect(commands[0].severity).toBe('critical');
  });

  it('supersedes previously-open blocks when a manual_control decision arrives', async () => {
    const { service, queryBuilder } = buildService();

    await service.execute(
      makeRun([
        makeOutput('police-operator', {
          kind: 'manual_control',
          severity: 'critical',
          rationale: ['take control'],
          override: true,
        }),
      ]),
    );

    // The supersede update query should have been built against the
    // block_automatic_control kind for the active intersection.
    expect(queryBuilder.update).toHaveBeenCalled();
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'superseded' }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'kind = :kind',
      expect.objectContaining({ kind: 'block_automatic_control' }),
    );
  });

  it('supersedes previously-open blocks when a release_manual_control decision arrives', async () => {
    const { service, queryBuilder } = buildService();

    await service.execute(
      makeRun([
        makeOutput('police-operator', {
          kind: 'release_manual_control',
          severity: 'info',
          rationale: ['operator returned control'],
        }),
      ]),
    );

    expect(queryBuilder.execute).toHaveBeenCalled();
  });

  it('does not run supersede for a non-blocking decision', async () => {
    const { service, queryBuilder } = buildService();

    await service.execute(
      makeRun([
        makeOutput('bus-priority', {
          kind: 'extend_green',
          severity: 'advisory',
          rationale: ['bus'],
          payload: { extensionSeconds: 6 },
        }),
      ]),
    );

    expect(queryBuilder.update).not.toHaveBeenCalled();
  });

  it('returns the persisted view shape (issuedAt as ISO string, payload as object, etc.)', async () => {
    const { service } = buildService();

    const [command] = await service.execute(
      makeRun([
        makeOutput('bus-priority', {
          kind: 'extend_green',
          severity: 'advisory',
          rationale: ['bus'],
          payload: { extensionSeconds: 6 },
        }),
      ]),
    );

    expect(command).toMatchObject({
      kind: 'modify_phase_timing',
      severity: 'advisory',
      override: false,
      status: 'queued',
      scope: 'intersection',
      scopeRef: 'INT-CAS-001',
      intersectionCode: 'INT-CAS-001',
      agentId: 'bus-priority',
      decisionKind: 'extend_green',
    });
    expect(typeof command.issuedAt).toBe('string');
    expect(command.payload).toEqual({ extensionSeconds: 6 });
  });
});
