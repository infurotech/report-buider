import { Module } from '@nestjs/common';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { TemplateModule } from '../template/template.module';

@Module({
  imports: [TemplateModule],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
