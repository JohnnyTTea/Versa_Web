import { Controller, Get, Header } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Public } from './auth/public.decorator';

@Controller('api/announcements')
export class AnnouncementsController {
  @Public()
  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  getAnnouncements(): Promise<string> {
    return readFile(resolve(__dirname, '../../web/public/announcements.txt'), 'utf8');
  }
}
