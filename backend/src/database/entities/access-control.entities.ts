import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';

import { AppBaseEntity } from './base.entity';

@Entity({ name: 'permissions' })
export class PermissionEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 120 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  description!: string;
}

@Entity({ name: 'roles' })
export class RoleEntity extends AppBaseEntity {
  @Column({ type: 'varchar', unique: true, length: 64 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  displayName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @ManyToMany(() => PermissionEntity, {
    eager: true,
  })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'permission_id',
      referencedColumnName: 'id',
    },
  })
  permissions!: PermissionEntity[];
}
