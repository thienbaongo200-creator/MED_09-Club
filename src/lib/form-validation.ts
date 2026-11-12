import type { FormEvent } from 'react';

type NativeFormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function getNativeField(event: FormEvent<HTMLFormElement>): NativeFormField | null {
  const target = event.target as NativeFormField;
  return typeof target?.setCustomValidity === 'function' ? target : null;
}

function setVietnameseValidationMessage(event: FormEvent<HTMLFormElement>) {
  const field = getNativeField(event);
  if (!field) return;

  const validity = field.validity;
  if (validity.valueMissing) field.setCustomValidity('Vui lòng điền thông tin bắt buộc.');
  else if (validity.typeMismatch && field.type === 'email') field.setCustomValidity('Vui lòng nhập địa chỉ email hợp lệ.');
  else if (validity.tooShort) field.setCustomValidity(`Vui lòng nhập ít nhất ${(field as HTMLInputElement | HTMLTextAreaElement).minLength} ký tự.`);
  else if (validity.rangeUnderflow) field.setCustomValidity(`Giá trị phải lớn hơn hoặc bằng ${(field as HTMLInputElement).min}.`);
  else if (validity.rangeOverflow) field.setCustomValidity(`Giá trị không được vượt quá ${(field as HTMLInputElement).max}.`);
  else if (validity.badInput && field.type === 'number') field.setCustomValidity('Vui lòng nhập một số hợp lệ.');
  else if (validity.patternMismatch) field.setCustomValidity('Giá trị không đúng định dạng.');
  else field.setCustomValidity('Giá trị không hợp lệ.');
}

function clearVietnameseValidationMessage(event: FormEvent<HTMLFormElement>) {
  getNativeField(event)?.setCustomValidity('');
}

export const vietnameseNativeValidationHandlers = {
  onInvalidCapture: setVietnameseValidationMessage,
  onInputCapture: clearVietnameseValidationMessage,
  onChangeCapture: clearVietnameseValidationMessage,
};
