import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ModifyService } from './modify.service';

@Controller('api/modify')
export class ModifyController {
  constructor(private readonly modify: ModifyService) {}

  private assertModifyPermission(req: Request) {
    const request = req as Request & {
      session?: {
        role_name?: string;
        role?: string;
        perms?: { modify?: boolean };
      };
    };
    const session = request.session;
    const role = String(
      session?.role_name ?? session?.role ?? '',
    ).toLowerCase();
    if (role !== 'admin' && session?.perms?.modify !== true) {
      throw new ForbiddenException('No permission to modify data');
    }
  }

  private getExcelBuffer(file?: {
    buffer?: Buffer;
    originalname?: string;
  }): Buffer {
    if (!file?.buffer?.length)
      throw new BadRequestException('请上传 Excel/CSV/TXT 文件');
    const allowedExtensions = ['.xlsx', '.xls', '.csv', '.tsv', '.txt'];
    const name = String(file.originalname ?? '').toLowerCase();
    const isAllowed = allowedExtensions.some((ext) => name.endsWith(ext));
    if (!isAllowed) {
      throw new BadRequestException('只支持 .xlsx/.xls/.csv/.tsv/.txt 格式的文件');
    }
    return file.buffer;
  }

  // POST /api/modify/other-charge
  @Post('other-charge')
  async otherCharge(
    @Body()
    body: {
      action?: string;
      start_date?: string;
      end_date?: string;
      dry_run?: boolean;
    },
    @Req() req: Request,
  ) {
    this.assertModifyPermission(req);
    return await this.modify.runOtherCharge({
      action: body?.action || '',
      start_date: body?.start_date || '',
      end_date: body?.end_date || '',
      dry_run: !!body?.dry_run,
    });
  }

  @Post('sales-order-tax/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async previewSalesOrderTax(
    @UploadedFile()
    file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body() body: { company?: string },
    @Req() req: Request,
  ) {
    this.assertModifyPermission(req);
    return this.modify.previewSalesOrderTax(
      this.getExcelBuffer(file),
      body?.company || '',
    );
  }

  @Post('sales-order-tax/execute')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async executeSalesOrderTax(
    @UploadedFile()
    file: { buffer?: Buffer; originalname?: string } | undefined,
    @Body() body: { company?: string; expected?: string },
    @Req() req: Request,
  ) {
    this.assertModifyPermission(req);
    let expectedRows: unknown;
    try {
      expectedRows = JSON.parse(body?.expected || '');
    } catch {
      throw new BadRequestException('预览信息缺失或格式不正确，请重新预览');
    }
    return this.modify.executeSalesOrderTax(
      this.getExcelBuffer(file),
      body?.company || '',
      expectedRows,
    );
  }

  // GET /api/modify/ping
  @Get('ping')
  ping() {
    return { ok: true };
  }

  // GET /api/modify/other-charge
  @Get('other-charge')
  otherChargeGet() {
    return { ok: false, message: 'Use POST /api/modify/other-charge' };
  }
}
