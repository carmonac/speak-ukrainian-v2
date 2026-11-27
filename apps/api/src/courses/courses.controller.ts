import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  idSchema,
  saveCourseSchema,
  setLessonExerciseSchema,
  slugSchema,
  type CourseDetail,
  type CourseOutline,
  type CourseSummary,
  type SaveCourseInput,
  type SetLessonExerciseInput,
} from '@speakukrainian/shared';
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CoursesService } from './courses.service.js';
import { PublishedCourses } from './published-courses.js';

@ApiTags('courses')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly published: PublishedCourses,
  ) {}

  @Get()
  list(): Promise<CourseSummary[]> {
    return this.courses.list();
  }

  @Get(':id')
  findOne(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<CourseDetail> {
    return this.courses.findById(id);
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(saveCourseSchema)) body: SaveCourseInput,
  ): Promise<CourseDetail> {
    const course = await this.courses.create(body);
    // The public site lists published courses from memory.
    this.published.clear();
    return course;
  }

  @Put(':id')
  async update(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(saveCourseSchema)) body: SaveCourseInput,
  ): Promise<CourseDetail> {
    const course = await this.courses.update(id, body);
    this.published.clear();
    return course;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ZodValidationPipe(idSchema)) id: string): Promise<void> {
    await this.courses.remove(id);
    this.published.clear();
  }
}

@ApiTags('courses')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/lessons')
export class AdminLessonsController {
  constructor(private readonly courses: CoursesService) {}

  @Put(':id/exercise')
  @HttpCode(HttpStatus.NO_CONTENT)
  setExercise(
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(setLessonExerciseSchema)) body: SetLessonExerciseInput,
  ): Promise<void> {
    return this.courses.setLessonExercise(id, body.h5pContentId);
  }
}

/** The catalogue anyone can browse before registering. */
@ApiTags('courses')
@Controller('courses')
export class PublicCoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Public()
  @Get()
  list(): Promise<CourseSummary[]> {
    return this.courses.list(true);
  }

  @Public()
  @Get(':slug')
  findOne(@Param('slug', new ZodValidationPipe(slugSchema)) slug: string): Promise<CourseOutline> {
    return this.courses.findPublishedOutline(slug);
  }
}
