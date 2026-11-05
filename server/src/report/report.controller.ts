import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportService } from './report.service';

@Controller('api/report')
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Get('data/vendor')
  async dataVendor(@Query('vendor') vendor?: string) {
    const vendorId = (vendor || '').trim();
    if (!vendorId) return { ok: false, message: 'Missing vendor', vendor: null, rows: [] };
    return await this.reports.getDataReportVendor(vendorId);
  }

  @Get('data/sku')
  async dataSku(@Query('sku') sku?: string) {
    const itemId = (sku || '').trim();
    if (!itemId) return { ok: false, message: 'Missing sku', item: null, rows: [], trend: [] };
    return await this.reports.getDataReportSku(itemId);
  }

  @Get('data/sku/features')
  async dataSkuFeatures(@Query('sku') sku?: string) {
    const itemId = (sku || '').trim();
    if (!itemId) return { ok: false, message: 'Missing sku', item: null, extracted: null };
    return await this.reports.getDataReportSkuFeatures(itemId);
  }

  @Post('data/analyze')
  async analyzeRows(
    @Body() body: { rows?: Array<Record<string, any>>; fileName?: string; async?: boolean },
  ) {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) {
      return { ok: false, message: 'No rows to analyze', results: [] };
    }

    if (body?.async) {
      return await this.reports.startAnalyzeJob(rows, body?.fileName || 'uploaded-data');
    }

    return await this.reports.analyzeRows(rows, body?.fileName || 'uploaded-data');
  }

  @Get('data/analyze/progress')
  async analyzeProgress(@Query('jobId') jobId?: string) {
    if (!jobId) {
      return { ok: false, status: 'failed', message: 'Missing jobId', results: [] };
    }

    return await this.reports.getAnalyzeJobProgress(jobId);
  }

  @Post('generate')
  async generate(
    @Body()
    body: {
      report?: string;
      export_name?: string;
      event?: string;
      start_date?: string;
      end_date?: string;
    },
  ) {
    const report = (body?.report || '').trim() as any;
    if (!report) return { success: false, error: '未知报表类型' };

    try {
      const res = await this.reports.generate(report, {
        startDate: body?.start_date,
        endDate: body?.end_date,
      });
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
