/**
 * PhoneField — тесты маскированного ввода телефона: постоянный префикс
 * «+998» вне инпута, форматирование при наборе/вставке, контракт onChange
 * (маска с «+998 »), Backspace через разделитель группы, каретка.
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneField } from './phone-field';

function Harness({
  initial = '',
  ...rest
}: { initial?: string } & Partial<React.ComponentProps<typeof PhoneField>>) {
  const [value, setValue] = React.useState(initial);
  return (
    <>
      <PhoneField aria-label="phone" {...rest} value={value} onChange={setValue} />
      {/* Значение, которое получил родитель через onChange. */}
      <output data-testid="masked">{value}</output>
    </>
  );
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText('phone') as HTMLInputElement;
}

function masked(): string {
  return screen.getByTestId('masked').textContent ?? '';
}

describe('PhoneField', () => {
  it('префикс +998 виден в пустом поле без фокуса и не входит в value инпута', () => {
    render(<Harness placeholder="90 123 45 67" />);
    expect(screen.getByText('+998')).toBeVisible();
    expect(getInput()).toHaveValue('');
    expect(getInput()).not.toHaveFocus();
    expect(getInput()).toHaveAttribute('placeholder', '90 123 45 67');
  });

  it('префикс остаётся при заполненном поле и описывает инпут (aria-describedby)', () => {
    render(<Harness initial="+998 90 123 45 67" />);
    const prefix = screen.getByText('+998');
    expect(prefix).toBeVisible();
    expect(getInput()).toHaveValue('90 123 45 67');
    expect(getInput().getAttribute('aria-describedby')).toContain(prefix.id);
  });

  it('клик по префиксу фокусирует инпут', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByText('+998'));
    expect(getInput()).toHaveFocus();
  });

  it('набор цифр: в инпуте XX XXX XX XX, в onChange — маска с +998', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), '90123');
    expect(getInput()).toHaveValue('90 123');
    expect(masked()).toBe('+998 90 123');
    await user.type(getInput(), '4567');
    expect(getInput()).toHaveValue('90 123 45 67');
    expect(masked()).toBe('+998 90 123 45 67');
  });

  it('нецифровой ввод игнорируется', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), 'abc');
    expect(getInput()).toHaveValue('');
    expect(masked()).toBe('');
  });

  it('лишние цифры сверх 9 отбрасываются', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), '9012345678');
    expect(getInput()).toHaveValue('90 123 45 67');
  });

  it('оператор 99: лишняя цифра не принимается за код страны 998', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(getInput(), '9981234567');
    expect(getInput()).toHaveValue('99 812 34 56');
    expect(masked()).toBe('+998 99 812 34 56');
  });

  it.each([
    ['+998901234567'],
    ['998901234567'],
    ['8 90 123 45 67'],
    ['8 90 123-45-67'],
    ['+998 90 123 45 67'],
    ['901234567'],
  ])('вставка полного номера «%s» разбирается', async (text) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(getInput());
    await user.paste(text);
    expect(getInput()).toHaveValue('90 123 45 67');
    expect(masked()).toBe('+998 90 123 45 67');
  });

  it('вставка поверх выделенного номера заменяет его', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 91 111 11 11" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(0, input.value.length);
    await user.paste('+998901234567');
    expect(input).toHaveValue('90 123 45 67');
    expect(masked()).toBe('+998 90 123 45 67');
  });

  it('Backspace на разделителе группы удаляет цифру перед ним', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    // Каретка сразу после «90 » (позиция 3, слева — пробел группы).
    input.setSelectionRange(3, 3);
    await user.keyboard('{Backspace}');
    // Удалилась «0» из «90», остальные цифры сдвинулись.
    expect(input).toHaveValue('91 234 56 7');
    expect(masked()).toBe('+998 91 234 56 7');
    // Каретка осталась на месте удаления (после «9»).
    expect(input.selectionStart).toBe(1);
  });

  it('Backspace в начале инпута ничего не ломает (префикс вне инпута)', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(0, 0);
    await user.keyboard('{Backspace}');
    expect(input).toHaveValue('90 123 45 67');
    expect(screen.getByText('+998')).toBeVisible();
  });

  it('стирание всех цифр даёт пустое value, префикс остаётся', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90" />);
    const input = getInput();
    await user.click(input);
    await user.keyboard('{Backspace}{Backspace}');
    expect(input).toHaveValue('');
    expect(masked()).toBe('');
    expect(screen.getByText('+998')).toBeVisible();
  });

  it('правка в середине не прыгает кареткой в конец', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123 45 67" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(6, 6); // после «123»
    await user.keyboard('{Backspace}'); // удаляем «3»
    expect(input).toHaveValue('90 124 56 7');
    // Каретка после «90 12».
    expect(input.selectionStart).toBe(5);
  });

  it('набор в середине ставит каретку после введённой цифры', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998 90 123" />);
    const input = getInput();
    input.focus();
    input.setSelectionRange(2, 2); // после «90»
    await user.keyboard('7');
    expect(input).toHaveValue('90 712 3');
    expect(input.selectionStart).toBe(4); // после «90 7»
  });

  it('className уходит на обёртку, ref и остальные пропсы — на инпут', () => {
    const ref = React.createRef<HTMLInputElement>();
    const onKeyDown = vi.fn();
    const { container } = render(
      <PhoneField
        ref={ref}
        id="ph"
        aria-label="phone"
        className="mt-2"
        value=""
        onChange={() => {}}
        onKeyDown={onKeyDown}
        disabled
      />,
    );
    expect(ref.current).toBe(getInput());
    expect(getInput()).toHaveAttribute('id', 'ph');
    expect(getInput()).toBeDisabled();
    expect(getInput()).not.toHaveClass('mt-2');
    expect(container.firstElementChild).toHaveClass('mt-2');
  });
});
