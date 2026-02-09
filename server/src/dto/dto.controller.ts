import { Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { DtoService } from './dto.service';

@Controller('api/dto')
export class DtoController {
  constructor(private readonly dto: DtoService) {}

  // POST /api/dto/upload (multipart/form-data, field: csvFile)
  @Post('upload')
  @UseInterceptors(FileInterceptor('csvFile'))
  async upload(@UploadedFile() file?: any) {
    if (!file?.buffer) return { success: false, message: 'No file uploaded' };

    try {
      const table = await this.dto.buildTableFromCsv(file.buffer);
      return { success: true, table };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Failed to parse CSV' };
    }
  }

  // POST /api/dto/save (json { data })
  @Post('save')
  async save(@Body() body: { data?: any[][] }) {
    const data = body?.data;
    if (!Array.isArray(data) || data.length === 0) {
      return { status: 'error', message: 'Missing data' };
    }

    try {
      const headers = data[0];
      const rows = data.slice(1);
      if (!Array.isArray(headers) || headers.length === 0) {
        return { status: 'error', message: 'Empty headers or rows' };
      }
      const table = rows.map((r) => {
        const obj: Record<string, any> = {};
        headers.forEach((h: any, i: number) => {
          obj[String(h)] = r?.[i] ?? '';
        });
        return obj;
      });
      const { filename } = await this.dto.saveAndBuildExcel(table);
      return { status: 'ok', download_url: `/api/dto/download?file=${encodeURIComponent(filename)}` };
    } catch (e: any) {
      return { status: 'error', message: e?.message || 'Save failed' };
    }
  }

  // GET /api/dto/download?file=xxx.csv
  @Get('download')
  async download(@Query('file') file: string, @Res() res: Response) {
    const filePath = await this.dto.getFilePath(file || '');
    if (!filePath) return res.status(404).send('File not found');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    return res.sendFile(filePath);
  }
}
