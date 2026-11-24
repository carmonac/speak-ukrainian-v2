import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  listUsersQuerySchema,
  sendEmailSchema,
  sendMessageSchema,
  updateUserSchema,
  type ConversationSummary,
  type ListUsersQuery,
  type Message,
  type Page,
  type SendEmailInput,
  type SendMessageInput,
  type UpdateUserInput,
  type UserDetail,
  type UserSummary,
} from '@speakukrainian/shared';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { EmailService } from '../email/email.service.js';
import { MessagesService } from '../messages/messages.service.js';
import { UsersService } from './users.service.js';

const userId = () => new ZodValidationPipe(idSchema);

@ApiTags('users')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly messages: MessagesService,
    private readonly email: EmailService,
  ) {}

  @Get('users')
  list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<Page<UserSummary>> {
    return this.users.list(query);
  }

  @Get('users/:id')
  findOne(@Param('id', userId()) id: string): Promise<UserDetail> {
    return this.users.findById(id);
  }

  @Patch('users/:id')
  update(
    @Param('id', userId()) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ): Promise<UserDetail> {
    return this.users.update(id, body);
  }

  @Post('users/:id/email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendEmail(
    @Param('id', userId()) id: string,
    @Body(new ZodValidationPipe(sendEmailSchema)) body: SendEmailInput,
  ): Promise<void> {
    const user = await this.users.findById(id);
    await this.email.send({
      to: user.email,
      userId: user.id,
      subject: body.subject,
      text: body.body,
      kind: 'admin-message',
    });
  }

  @Get('conversations')
  conversations(): Promise<ConversationSummary[]> {
    return this.messages.conversations();
  }

  @Get('users/:id/messages')
  thread(@Param('id', userId()) id: string): Promise<Message[]> {
    return this.messages.thread(id);
  }

  @Post('users/:id/messages')
  send(
    @Param('id', userId()) id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<Message> {
    return this.messages.send(id, 'admin', body.body);
  }

  @Post('users/:id/messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@Param('id', userId()) id: string): Promise<void> {
    return this.messages.markRead(id, 'admin');
  }
}
