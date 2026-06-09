/**
 * Skeleton — плейсхолдер загрузки с shimmer (перенос .skel из tokens.css).
 * Класс `.shimmer` объявлен в globals.css (@layer utilities).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <div className={cn('shimmer rounded-lg', className)} {...props} />;
}
