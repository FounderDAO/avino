/**
 * DropdownItem — слот trailing (правый аддон, напр. пилюля-счётчик).
 * Radix-меню рендерим сразу открытым (defaultOpen), чтобы проверить содержимое.
 */
import * as React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from './dropdown';

beforeAll(() => {
  // Radix DropdownMenu опирается на эти DOM-API, которых нет в jsdom.
  if (!Element.prototype.hasPointerCapture)
    Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture)
    Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView)
    Element.prototype.scrollIntoView = () => {};
});

describe('DropdownItem trailing', () => {
  it('рендерит trailing-узел справа от текста пункта', () => {
    render(
      <Dropdown defaultOpen>
        <DropdownTrigger>open</DropdownTrigger>
        <DropdownContent>
          <DropdownItem trailing={<span>9</span>}>Поиски</DropdownItem>
        </DropdownContent>
      </Dropdown>,
    );
    expect(screen.getByText('Поиски')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    const label = screen.getByText('Поиски');
    const badge = screen.getByText('9');
    expect(label.compareDocumentPosition(badge)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('не рендерит правый блок без trailing и selected', () => {
    render(
      <Dropdown defaultOpen>
        <DropdownTrigger>open</DropdownTrigger>
        <DropdownContent>
          <DropdownItem>Просто пункт</DropdownItem>
        </DropdownContent>
      </Dropdown>,
    );
    expect(screen.getByText('Просто пункт')).toBeInTheDocument();
    // Правый wrapper (.shrink-0) появляется только при trailing/selected.
    expect(document.querySelector('.shrink-0')).toBeNull();
  });

  it('рендерит галочку при selected без trailing', () => {
    render(
      <Dropdown defaultOpen>
        <DropdownTrigger>open</DropdownTrigger>
        <DropdownContent>
          <DropdownItem selected>Выбранный</DropdownItem>
        </DropdownContent>
      </Dropdown>,
    );
    // lucide Check — это <svg>; других иконок в открытом меню нет.
    expect(document.querySelector('svg')).toBeInTheDocument();
  });
});
