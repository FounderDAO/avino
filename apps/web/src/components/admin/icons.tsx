/**
 * Иконки админки — lucide-react под именами из прототипа
 * (apps/claudeDesign/scripts/icons.jsx). Стиль Lucide/Feather, stroke 2 —
 * совпадает с исходными SVG. Централизованный реэкспорт, чтобы страницы
 * импортировали из одного места.
 */
import {
  Search,
  Building2,
  Home,
  Check,
  User,
  Sparkles,
  List,
  SlidersHorizontal,
  Bell,
  Menu,
  Mail,
  Phone,
  CalendarDays,
  Clock,
  LogOut,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Send,
  MessageSquare,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';

export const IC = {
  Search,
  Building: Building2,
  Home,
  Check,
  User,
  Sparkle: Sparkles,
  ListIcon: List,
  Sliders: SlidersHorizontal,
  Bell,
  Menu,
  Mail,
  Phone,
  Calendar: CalendarDays,
  Clock,
  LogOut,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Send,
  MessageSquare,
  Megaphone,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof IC;
export type { LucideIcon };
