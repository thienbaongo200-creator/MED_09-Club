export class PublicStatementDto {
  id!: string;
  ngayTao!: string;
  loai!: 'THU' | 'CHI';
  noiDung!: string;
  soTien!: number;
  nguoiThucHien!: string;
  email!: string | null;
  soDienThoai!: string | null;
  deXuatId!: string | null;
  coChungTu!: boolean;
}
