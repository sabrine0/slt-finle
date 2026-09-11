import { Column, Entity } from 'typeorm';

import { AppBaseEntity } from './base.entity';

export type DocumentIngestRunStatus = 'running' | 'completed' | 'failed';

/**
 * Audit row for a document-ingest pass. The ingest service writes
 * one row per scan so operators can see what was touched and when,
 * without parsing application logs.
 */
@Entity('document_ingest_runs')
export class DocumentIngestRunEntity extends AppBaseEntity {
  @Column({ type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'running' })
  status!: DocumentIngestRunStatus;

  /** Root folder scanned (the value of STLS_ENGINEERING_REFERENCES_ROOT). */
  @Column({ type: 'varchar', length: 1024 })
  rootPath!: string;

  @Column({ type: 'int', default: 0 })
  filesScanned!: number;

  @Column({ type: 'int', default: 0 })
  documentsCreated!: number;

  @Column({ type: 'int', default: 0 })
  documentsUpdated!: number;

  @Column({ type: 'int', default: 0 })
  programmePackagesCreated!: number;

  @Column({ type: 'int', default: 0 })
  programmePackagesUpdated!: number;

  @Column({ type: 'int', default: 0 })
  skipped!: number;

  @Column({ type: 'int', default: 0 })
  errored!: number;

  /**
   * Per-file error log (max ~200 entries kept). Stored as JSONB so
   * the operator UI can show a table of failures.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  errors!: Array<{ path: string; message: string }>;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
