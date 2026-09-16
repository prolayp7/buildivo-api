import { Module } from '@nestjs/common';
import { AdminQnaController } from './qna.controller';
import { AdminQnaService } from './qna.service';
@Module({ controllers: [AdminQnaController], providers: [AdminQnaService] })
export class AdminQnaModule {}
