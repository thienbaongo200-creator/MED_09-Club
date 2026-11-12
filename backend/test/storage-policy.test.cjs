const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BadRequestException } = require('@nestjs/common');
const { validateVoucherFile } = require('../dist/funds/funds.controller.js');

const file = (originalname, mimetype, bytes) => ({ originalname, mimetype, size: bytes.length, buffer: Buffer.from(bytes) });

test('accepts supported voucher signatures and strips client path components from display filenames', () => {
  const pdf = validateVoucherFile(file('C:\\temp\\receipt.pdf', 'application/pdf', '%PDF-1.7 test'));
  const jpeg = validateVoucherFile(file('photo.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0xd9]));
  const png = validateVoucherFile(file('photo.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(pdf.originalname, 'receipt.pdf');
  assert.equal(jpeg.originalname, 'photo.jpg');
  assert.equal(png.originalname, 'photo.png');
});

test('rejects MIME spoofing, empty files, files over 10 MB, and unsafe filenames', () => {
  assert.throws(() => validateVoucherFile(file('spoof.pdf', 'application/pdf', 'not a PDF')), BadRequestException);
  assert.throws(() => validateVoucherFile(file('empty.pdf', 'application/pdf', '')), BadRequestException);
  assert.throws(() => validateVoucherFile(file('large.png', 'image/png', Buffer.alloc(10 * 1024 * 1024 + 1))), BadRequestException);
  assert.throws(() => validateVoucherFile(file('  ', 'application/pdf', '%PDF-1.7')), BadRequestException);
  assert.throws(() => validateVoucherFile(file('x'.repeat(256), 'application/pdf', '%PDF-1.7')), BadRequestException);
});
