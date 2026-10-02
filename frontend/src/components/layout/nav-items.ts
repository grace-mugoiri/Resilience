import {
  Home,
  MessageCircle,
  Users,
  Wallet,
  Settings,
  Compass,
  HeartHandshake,
  FileHeart,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the compact mobile bottom nav (Figma: Home, Messages, Wallet, Settings). */
  primary?: boolean;
}

export const survivorNavItems: NavItem[] = [
  { href: "/survivor", label: "Home", icon: Home, primary: true },
  { href: "/survivor/support", label: "Talk to someone", icon: HeartHandshake },
  { href: "/survivor/messages", label: "Messages", icon: MessageCircle, primary: true },
  { href: "/survivor/circle", label: "My circle", icon: Users },
  { href: "/survivor/resources", label: "Resources", icon: Compass },
  { href: "/survivor/records", label: "My records", icon: FileHeart },
  { href: "/survivor/wallet", label: "Wallet", icon: Wallet, primary: true },
  { href: "/survivor/settings", label: "Settings", icon: Settings, primary: true },
];

export const counselorNavItems: NavItem[] = [
  { href: "/counselor", label: "Dashboard", icon: Home, primary: true },
  { href: "/counselor/messages", label: "Messages", icon: MessageCircle, primary: true },
  { href: "/counselor/profile", label: "Profile", icon: Users, primary: true },
  { href: "/counselor/wallet", label: "Wallet", icon: Wallet, primary: true },
];
