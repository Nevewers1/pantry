/**
 * App icon set — thin wrappers over lucide-react so every screen shares one
 * clean, professional line-icon family. Call sites keep using the same names
 * (e.g. <BoxIcon className="h-5 w-5" />), so nothing else needs to change.
 */
import {
  type LucideIcon,
  ArrowLeft,
  BookOpen,
  Box,
  Camera,
  CalendarDays,
  Check,
  ChefHat,
  ChevronRight,
  Clock,
  Home,
  Leaf,
  Link as LinkGlyph,
  LogOut,
  Mail,
  MessageSquare,
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Trash2,
  X,
} from "lucide-react";

type IconProps = { className?: string };

// Wrap a lucide icon with our lighter default stroke and simple className API.
function wrap(Glyph: LucideIcon) {
  function Icon({ className }: IconProps) {
    return <Glyph className={className} strokeWidth={1.75} aria-hidden="true" />;
  }
  return Icon;
}

export const ArrowLeftIcon = wrap(ArrowLeft);
export const BookIcon = wrap(BookOpen);
export const BoxIcon = wrap(Box);
export const CalendarIcon = wrap(CalendarDays);
export const CameraIcon = wrap(Camera);
export const CartIcon = wrap(ShoppingCart);
export const CheckIcon = wrap(Check);
export const ChevronRightIcon = wrap(ChevronRight);
export const ClockIcon = wrap(Clock);
export const HomeIcon = wrap(Home);
export const LeafIcon = wrap(Leaf);
export const LinkIcon = wrap(LinkGlyph);
export const LogoutIcon = wrap(LogOut);
export const MailIcon = wrap(Mail);
export const MessageIcon = wrap(MessageSquare);
export const MinusIcon = wrap(Minus);
export const PlateIcon = wrap(ChefHat);
export const PlusIcon = wrap(Plus);
export const TrashIcon = wrap(Trash2);
export const XIcon = wrap(X);

// Star supports a filled variant for favourites.
export function StarIcon({
  className,
  filled,
}: IconProps & { filled?: boolean }) {
  return (
    <Star
      className={className}
      strokeWidth={1.75}
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
    />
  );
}
