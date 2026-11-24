import { Global, Module } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service.js';
import { RolesGuard } from './roles.guard.js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';
import { UserMirrorService } from './user-mirror.service.js';

@Global()
@Module({
  providers: [SupabaseAuthGuard, RolesGuard, AdminBootstrapService, UserMirrorService],
  exports: [SupabaseAuthGuard, RolesGuard],
})
export class AuthModule {}
