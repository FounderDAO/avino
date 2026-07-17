/**
 * PhoneField — тесты маскированного ввода телефона: форматирование при
 * наборе/вставке, Backspace через разделитель группы, защита префикса.
 */
import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneField } from './phone-field';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = React.useState(initial);
  return <PhoneField aria-label="phone" value={value} onChange={setValue} />;
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText('phone') as HTMLInputElement;
}

describe('PhoneField', () => {
  it('набор цифр форматируется в +998 XX XXX XX XX', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), '901234567');
    expect(getInput()).toHaveValue('+998 90 123 45 67');
  });

  it('нецифровой ввод игнорируется', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), 'abc');
    expect(getInput()).toHaveValue('');
  });

  it('вставка полного E.164 форматируется', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(getInput());
    await user.paste('+998901234567');
    expect(getInput()).toHaveValue('+998 90 123 45 67');
  });

  it('вставка местного формата с ведущей 8 форматируется', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(getInput());
    await user.paste('8 90 123-45-67');
    expect(getInput()).toHaveValue('+998 90 123 45 67');
  });

  it('Backspace на разделителе группы удаляет цифру перед ним', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    // Каретка сразу после «+998 90 » (позиция 8, слева — пробел группы).
    input.setSelectionRange(8, 8);
    await user.keyboard('{Backspace}');
    // Удалилась «0» из «90», остальные цифры сдвинулись.
    expect(input).toHaveValue('+998 91 234 56 7');
    // Каретка осталась после места удаления (после «+998 9»).
    expect(input.selectionStart).toBe(6);
  });

  it('Backspace не стирает фиксированный префикс', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(5, 5); // сразу после «+998 »
    await user.keyboard('{Backspace}');
    expect(input).toHaveValue('+998 90 123 45 67');
  });

  it('правка в середине не прыгает кареткой в конец', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(11, 11); // после «123»
    await user.keyboard('{Backspace}'); // удаляем «3»
    expect(input).toHaveValue('+998 90 124 56 7');
    // Каретка после «+998 90 12».
    expect(input.selectionStart).toBe(10);
  });
});
