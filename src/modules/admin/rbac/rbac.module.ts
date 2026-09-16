import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({ controllers: [AdminUsersController, RolesController], providers: [AdminUsersService, RolesService] })
export class RbacModule {}
