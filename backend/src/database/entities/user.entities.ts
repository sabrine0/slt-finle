import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { RoleEntity } from './access-control.entities';
import { AppBaseEntity } from './base.entity';

@Entity({ name: 'users' })
export class UserEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 160 })
  email!: string;

  @Column({ type: 'varchar', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordChangedAt!: Date | null;

  @ManyToMany(() => RoleEntity, {
    eager: true,
  })
  @JoinTable({
    name: 'user_roles',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
    },
  })
  roles!: RoleEntity[];

  @OneToMany(() => RefreshTokenEntity, (refreshToken) => refreshToken.user)
  refreshTokens!: RefreshTokenEntity[];
}

@Entity({ name: 'refresh_tokens' })
export class RefreshTokenEntity extends AppBaseEntity {
  @Column({ type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'boolean', default: false })
  isCompromised!: boolean;

  @Column({ type: 'varchar', length: 160, nullable: true })
  deviceName!: string | null;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;
}
