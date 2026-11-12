export type Role = 'ADMIN' | 'THU_QUY' | 'THANH_VIEN';
export interface AuthUser { sub: string; role: Role; email: string; }
