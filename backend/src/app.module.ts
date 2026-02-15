import { Module } from '@nestjs/common';
import { ReportModule } from './report/report.module';
import { TemplateModule } from './template/template.module';

@Module({
  imports: [TemplateModule, ReportModule],
})
export class AppModule {}
