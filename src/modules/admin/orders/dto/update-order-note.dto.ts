import { IsString } from 'class-validator';

export class UpdateOrderNoteDto { @IsString() adminNote: string; }
