import { Global, Module } from '@nestjs/common';
import { BridgeDriver } from './bridge.driver.js';
import { DatabaseService } from './database.service.js';
import { SQL_DRIVER } from './sql-driver.js';

@Global()
@Module({
  providers: [{ provide: SQL_DRIVER, useClass: BridgeDriver }, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
