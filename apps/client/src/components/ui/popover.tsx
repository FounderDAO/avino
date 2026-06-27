/**
 * Popover — лёгкая обёртка над radix-ui Popover со стилями Avino.
 * В отличие от Dropdown (меню), Popover держит произвольный интерактивный
 * контент (слайдер, инпуты, табы) без menu-семантики (arrow-key/typeahead).
 * Без класса `fade-up` (он ломает containing block для fixed-потомков).
 */
'use client';

import * as React from 'react';
import { Popover as RadixPopover } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof RadixPopover.Content>,
  React.ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(({ className, sideOffset = 8, align = 'start', ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      sideOffset={sideOffset}
      align={align}
      className={cn(
        'z-50 rounded-xl bg-surface p-4 shadow-raised',
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
));
PopoverContent.displayName = 'PopoverContent';
