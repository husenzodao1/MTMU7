import {
  Search,
  Bell, BookOpen, BookOpenCheck, CalendarClock, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, Contact,
  FileBarChart, FileText, FolderOpen, GraduationCap, Image, Landmark, LayoutDashboard, LineChart, Megaphone, MessageSquare,
  MessageSquareWarning, Newspaper, NotebookPen, Presentation, Radio, ScrollText, Settings, ShieldCheck, SquareStack,
  Ticket, UserCheck, UserCog, Users, UsersRound, Globe, Activity, School, Building2, BookMarked, Headset,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/components/shell/navigation";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  search: Search,
  teach: Presentation,
  schedule: CalendarDays,
  grades: GraduationCap,
  attendance: ClipboardCheck,
  homework: NotebookPen,
  children: UsersRound,
  library: BookOpen,
  news: Newspaper,
  announcements: Megaphone,
  events: CalendarRange,
  documents: FolderOpen,
  messages: MessageSquare,
  notifications: Bell,
  admin: ShieldCheck,
  contacts: Contact,
  students: GraduationCap,
  staff: UserCog,
  guardians: UsersRound,
  users: Users,
  approvals: UserCheck,
  invitations: Ticket,
  years: CalendarClock,
  classes: School,
  subjects: BookMarked,
  gradebook: BookOpenCheck,
  timetable: ClipboardList,
  media: Image,
  website: Globe,
  broadcasts: Radio,
  moderation: MessageSquareWarning,
  support: Headset,
  school: Landmark,
  roles: ShieldCheck,
  modules: SquareStack,
  platform: Building2,
  reports: FileBarChart,
  analytics: LineChart,
  audit: ScrollText,
  settings: Settings,
  status: Activity,
};

export function NavIcon({ name, className }: { name: IconName; className?: string }) {
  const Icon = ICONS[name] ?? FileText;
  return <Icon className={className ?? "size-[18px] shrink-0"} strokeWidth={1.75} aria-hidden />;
}
