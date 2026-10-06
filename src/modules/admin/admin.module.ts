import { Module } from '@nestjs/common';
import { ScalesModule } from '../scales/scales.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({ imports: [ScalesModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
