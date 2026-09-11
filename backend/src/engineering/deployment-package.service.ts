import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

import appConfig from '../config/app.config';
import {
  buildControllerRuntimeBasePackage,
  buildSignatureMetadata,
} from '../controller-manager/controller-runtime-contract';
import type { ControllerEntity, DeploymentEntity } from '../database/entities';
import type {
  DeploymentConfigurationContext,
  DeploymentPackageDocument,
  ValidationReport,
} from './engineering.types';

@Injectable()
export class DeploymentPackageService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  buildPackage(input: {
    deployment: DeploymentEntity;
    context: DeploymentConfigurationContext;
    targetController: ControllerEntity;
    validationReport: ValidationReport;
  }) {
    const generatedAt = input.deployment.requestedAt.toISOString();
    const packageVersion =
      input.deployment.packageVersion ??
      buildPackageVersion(
        input.context.intersection.code,
        input.deployment.id,
        input.deployment.createdAt,
      );
    const requestPayload =
      (input.deployment.packageManifest.requestPayload as
        | Record<string, unknown>
        | undefined
        | null) ?? {};
    const validationReport = {
      ...input.validationReport,
      generatedAt,
    };
    const baseDocument = buildControllerRuntimeBasePackage({
      controller: input.targetController,
      intersection: input.context.intersection,
      deployment: {
        ...input.deployment,
        packageVersion,
      },
      detectors: input.context.detectors,
      phases: input.context.phases,
      timingPlan: input.context.timingPlan,
      validationReport,
      requestPayload,
      scenarioCode: input.context.scenario?.code ?? null,
    });
    const packageDigest = sha256(stableStringify(baseDocument));
    const document: DeploymentPackageDocument = {
      ...baseDocument,
      signatureMetadata: buildSignatureMetadata({
        digest: packageDigest,
        signature: null,
        signedAt: null,
      }),
    };
    const manifest = {
      deploymentId: input.deployment.id,
      packageVersion,
      generatedAt,
      targetEnvironment: input.deployment.targetEnvironment,
      operatingMode: input.deployment.operatingMode,
      intersectionId: input.context.intersection.id,
      intersectionCode: input.context.intersection.code,
      controllerId: input.targetController.id,
      controllerCode: input.targetController.code,
      timingPlanCode: input.context.timingPlan.code,
      scenarioCode: input.context.scenario?.code ?? null,
      runtimeContractSchemaVersion:
        input.deployment.runtimeContractSchemaVersion,
    };

    return {
      document,
      manifest,
      packageVersion,
      packageDigest,
    };
  }

  signPackage(document: DeploymentPackageDocument) {
    const unsignedDocument = this.attachSignature(document, null, null);

    return createHmac('sha256', this.config.deploymentSigningSecret)
      .update(stableStringify(unsignedDocument))
      .digest('hex');
  }

  attachSignature(
    document: DeploymentPackageDocument,
    signature: string | null,
    signedAt: string | null,
  ): DeploymentPackageDocument {
    return {
      ...document,
      signatureMetadata: buildSignatureMetadata({
        digest: document.signatureMetadata.digest,
        signature,
        signedAt,
      }),
    };
  }
}

function buildPackageVersion(
  intersectionCode: string,
  deploymentId: string,
  createdAt: Date,
) {
  const sanitizedCode = intersectionCode
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
  const stamp = createdAt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

  return `${sanitizedCode}-${stamp}-${deploymentId.slice(0, 8)}`.slice(0, 80);
}

function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObject(entry));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortObject((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }

  return value;
}
