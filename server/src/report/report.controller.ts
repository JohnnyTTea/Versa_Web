import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportService } from './report.service';

@Controller('api/report')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Post('generate')
  async generate(
    @Body()
    body: { report?: string; export_name?: string; event?: string },
  ) {
    const report = (body?.report || '').trim() as any;
    if (!report) return { success: false, error: '未知报表类型' };

    try {
      const res = await this.reports.generate(report);
      return { success: true, file: res.file };
    } catch (e: any) {
      return { success: false, error: e?.message || '报表生成失败' };
    }
  }

  @Get('download')
  async download(@Query('file') file: string, @Res() res: Response) {
    const filePath = await this.reports.getFilePath(file || '');
    if (!filePath) return res.status(404).send('File not found');

    if (String(file || '').toLowerCase().endsWith('.xlsx')) {
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    return res.sendFile(filePath);
  }
}
