/**
 * Dropdown — лёгкая обёртка над radix-ui DropdownMenu со стилями Avino.
 * Реэкспортирует примитивы и даёт готовые Content/Item с токенами.
 */
'use client';

import * as React from 'react';
import { DropdownMenu as RadixDropdown } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dropdown = RadixDropdown.Root;
export const DropdownTrigger = RadixDropdown.Trigger;
export const DropdownPortal = RadixDropdown.Portal;

export const DropdownContent = React.forwardRef<
  React.ComponentRef<typeof RadixDropdown.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDropdown.Content>
>(({ className, sideOffset = 8, align = 'end', ...props }, ref) => (
  <RadixDropdown.Portal>
    <RadixDropdown.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'fade-up z-50 min-w-[160px] rounded-xl bg-surface p-1.5 shadow-raised',
        className,
      )}
      {...props}
    />
  </RadixDropdown.Portal>
));
DropdownContent.displayName = 'DropdownContent';

export interface DropdownItemProps
  extends React.ComponentPropsWithoutRef<typeof RadixDropdown.Item> {
  /** Показать галочку (выбранный пункт). */
  selected?: boolean;
}

export const DropdownItem = React.forwardRef<
  React.ComponentRef<typeof RadixDropdown.Item>,
  DropdownItemProps
>(({ className, children, selected, ...props }, ref) => (
  <RadixDropdown.Item
    ref={ref}
    className={cn(
      'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg px-3 py-[9px] text-sm font-semibold text-ink outline-none transition-colors',
      'data-[highlighted]:bg-mint',
      selected && 'bg-mint',
      className,
    )}
    {...props}
  >
    <span>{children}</span>
    {selected && <Check size={15} className="text-teal" />}
  </RadixDropdown.Item>
));
DropdownItem.displayName = 'DropdownItem';
