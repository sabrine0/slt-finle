import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { AuditOutcome } from './enums';
import { UserEntity } from './user.entities';

@Entity({ name: 'audit_logs' })
export class AuditLogEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 120 })
  action!: string;

  @Column({ type: 'varchar', length: 120 })
  resourceType!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  resourceId!: string | null;

  @Column({
    type: 'enum',
    enum: AuditOutcome,
    enumName: 'audit_outcome',
    default: AuditOutcome.SUCCESS,
  })
  outcome!: AuditOutcome;

  @Column({ type: 'varchar', length: 16 })
  method!: string;

  @Column({ type: 'varchar', length: 255 })
  route!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actorUserId' })
  actorUser!: UserEntity | null;
}
