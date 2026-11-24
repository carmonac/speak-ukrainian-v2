import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  checkoutSchema,
  idSchema,
  lessonResultSchema,
  sendMessageSchema,
  updateMyProfileSchema,
  type CheckoutInput,
  type CheckoutResult,
  type LessonProgress,
  type LessonResultInput,
  type Message,
  type MyCourseDetail,
  type MyCourseSummary,
  type MyProfile,
  type SendMessageInput,
  type UpdateMyProfileInput,
} from '@speakukrainian/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MessagesService } from '../messages/messages.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { MeService } from './me.service.js';

/** Routes of the signed-in student. Authentication is the global guard's job. */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly payments: PaymentsService,
    private readonly messages: MessagesService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthenticatedUser): Promise<MyProfile> {
    return this.me.profile(user);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateMyProfileSchema)) body: UpdateMyProfileInput,
  ): Promise<MyProfile> {
    return this.me.updateProfile(user, body);
  }

  @Get('courses')
  courses(@CurrentUser() user: AuthenticatedUser): Promise<MyCourseSummary[]> {
    return this.me.myCourses(user.uid);
  }

  @Get('courses/:id')
  course(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<MyCourseDetail> {
    return this.me.myCourse(user.uid, id);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
  ): Promise<CheckoutResult> {
    return this.payments.checkout(user, body.courseId);
  }

  @Post('lessons/:id/result')
  @HttpCode(HttpStatus.OK)
  result(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(lessonResultSchema)) body: LessonResultInput,
  ): Promise<LessonProgress> {
    return this.me.recordResult(user.uid, id, body);
  }

  @Get('messages')
  thread(@CurrentUser() user: AuthenticatedUser): Promise<Message[]> {
    return this.messages.thread(user.uid);
  }

  @Get('messages/unread-count')
  async unread(@CurrentUser() user: AuthenticatedUser): Promise<{ unread: number }> {
    return { unread: await this.messages.unreadCount(user.uid, 'student') };
  }

  @Post('messages')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageInput,
  ): Promise<Message> {
    return this.messages.send(user.uid, 'student', body.body, body.lessonId ?? null);
  }

  @Post('messages/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.messages.markRead(user.uid, 'student');
  }
}
