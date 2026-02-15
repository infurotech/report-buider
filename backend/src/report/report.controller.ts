import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportFormat, ReportService } from './report.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { TemplateService } from '../template/template.service';

@Controller('reports')
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly templateService: TemplateService,
  ) {}

  @Get('templates')
  async listTemplates(): Promise<{ templates: string[] }> {
    const templates = await this.templateService.listTemplates();
    return { templates };
  }

  @Post('generate')
  async generate(
    @Body() dto: GenerateReportDto,
    @Query('format') format: ReportFormat = 'html',
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reportService.generate(
      dto.template,
      dto.content,
      dto.config,
      format === 'pdf' ? 'pdf' : 'html',
      dto.options,
    );

    if (Buffer.isBuffer(result)) {
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="report.pdf"',
      });
      return new StreamableFile(result);
    }

    res.set('Content-Type', 'text/html');
    return result;
  }
}
