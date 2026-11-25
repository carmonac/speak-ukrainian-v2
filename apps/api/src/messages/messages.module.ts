import { Global, Module } from '@nestjs/common';
import { MessagesService } from './messages.service.js';
import { RemindersController } from './reminders.controller.js';

@Global()
@Module({
  controllers: [RemindersController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
