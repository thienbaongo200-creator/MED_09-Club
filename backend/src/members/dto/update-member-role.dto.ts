import { IsIn } from 'class-validator';
import { Role } from '../../common/auth/role';
export class UpdateMemberRoleDto { @IsIn(['ADMIN', 'THU_QUY', 'THANH_VIEN']) vaiTro!: Role; }
