import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { AppBaseEntity } from './base.entity';
import { OverrideAction, OverrideReasonCode, OverrideResult } from './enums';
import { IntersectionEntity } from './traffic.entities';
import { UserEntity } from './user.entities';

@Entity({ name: 'override_commands' })
@Index('IDX_override_commands_issued_at', ['issuedAt'])
@Index('IDX_override_commands_intersection', ['intersectionId'])
export class OverrideCommandEntity extends AppBaseEntity {
  @Column({
    type: 'enum',
    enum: OverrideAction,
    enumName: 'override_action',
  })
  action!: OverrideAction;

  @Column({
    type: 'enum',
    enum: OverrideReasonCode,
    enumName: 'override_reason_code',
  })
  reasonCode!: OverrideReasonCode;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @Column({
    type: 'enum',
    enum: OverrideResult,
    enumName: 'override_result',
    default: OverrideResult.ACCEPTED,
  })
  result!: OverrideResult;

  @Column({ type: 'int', nullable: true })
  durationSeconds!: number | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'varchar', length: 64 })
  intersectionCode!: string;

  @Column({ type: 'uuid', nullable: true })
  intersectionId!: string | null;

  @ManyToOne(() => IntersectionEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'intersectionId' })
  intersection!: IntersectionEntity | null;

  @Column({ type: 'uuid', nullable: true })
  operatorUserId!: string | null;

  @ManyToOne(() => UserEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'operatorUserId' })
  operatorUser!: UserEntity | null;
}
