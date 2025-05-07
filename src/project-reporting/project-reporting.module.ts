import { Module } from '@nestjs/common';
import { ProjectReportingService } from './project-reporting.service';

@Module({
  providers: [ProjectReportingService],
})
export class ProjectReportingModule {}