import { Module } from '@nestjs/common';
import { H5pModule } from '../h5p/h5p.module.js';
import {
  AdminCoursesController,
  AdminLessonsController,
  PublicCoursesController,
} from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { PublishedCourses } from './published-courses.js';

@Module({
  imports: [H5pModule],
  controllers: [AdminCoursesController, AdminLessonsController, PublicCoursesController],
  providers: [CoursesService, PublishedCourses],
  exports: [CoursesService, PublishedCourses],
})
export class CoursesModule {}
