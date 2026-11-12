import { IsIn } from 'class-validator';
export class UpdateMemberStatusDto { @IsIn(['ACTIVE', 'INACTIVE']) trangThai!: 'ACTIVE' | 'INACTIVE'; }
