// ============================================================
// SR PLATFORM — Global TypeScript Types
// ============================================================

export type UserRole = 'Admin' | 'Manager' | 'Technical' | 'User' | 'Viewer'
export type UserStatus = 'active' | 'inactive' | 'pending'
export type SRStatus = 'Open' | 'In Progress' | 'Pending' | 'Closed' | 'Archived'
export type SRPriority = 'Low' | 'Medium' | 'High' | 'Critical'
export type ActivityStatus = 'Open' | 'In Progress' | 'Done' | 'Cancelled'
export type ActivityType =
  | 'Call' | 'Follow-up' | 'Site Visit' | 'Internal Reminder'
  | 'Coordination' | 'Pre-Sales' | 'Support Note' | 'Other'
export type TemplateType = 'email' | 'whatsapp' | 'closure' | 'escalation' | 'reminder'
export type NotifChannel = 'email' | 'whatsapp'

// ────────────────────────────────────────────────────────────
// User
// ────────────────────────────────────────────────────────────
export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  team?: string
  phone?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

// ────────────────────────────────────────────────────────────
// SR
// ────────────────────────────────────────────────────────────
export interface SR {
  id: string
  sr_number: string
  title: string
  account?: string
  customer_name?: string
  customer_contact?: string
  customer_email?: string
  issue_type?: string
  issue_description: string
  priority: SRPriority
  status: SRStatus
  creator_id: string
  owner_id: string
  route_id?: string
  current_step: number
  resolution?: string
  closed_at?: string
  closed_by?: string
  drive_folder_url?: string
  drive_folder_id?: string
  reported_at: string
  updated_at: string
  created_at: string
  // joined fields
  owner_name?: string
  owner_email?: string
  creator_name?: string
  route_name?: string
}

export interface SRComment {
  id: string
  sr_id: string
  user_id: string
  body: string
  created_at: string
  user?: Pick<User, 'name' | 'role'>
}

export interface SRAttachment {
  id: string
  sr_id: string
  file_name: string
  drive_file_id: string
  drive_url: string
  uploaded_by: string
  uploaded_at: string
  user?: Pick<User, 'name'>
}

export interface SRStageHistory {
  id: string
  sr_id: string
  from_step?: number
  to_step: number
  notes?: string
  advanced_by: string
  advanced_at: string
  user?: Pick<User, 'name'>
}

// ────────────────────────────────────────────────────────────
// Activity
// ────────────────────────────────────────────────────────────
export interface Activity {
  id: string
  activity_no: string
  title: string
  type: ActivityType
  status: ActivityStatus
  notes?: string
  linked_sr?: string
  account?: string
  contact_name?: string
  contact_phone?: string
  owner_id: string
  creator_id: string
  drive_folder_url?: string
  due_date?: string
  closed_at?: string
  created_at: string
  updated_at: string
  owner?: Pick<User, 'name' | 'email'>
}

// ────────────────────────────────────────────────────────────
// Route
// ────────────────────────────────────────────────────────────
export interface RouteStep {
  id: string
  route_id: string
  step_order: number
  name: string
  description?: string
  assigned_role?: UserRole
  is_required: boolean
  sla_hours?: number
  email_template?: string
  wa_template?: string
  escalation_hours?: number
  created_at: string
}

export interface Route {
  id: string
  name: string
  description?: string
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
  steps?: RouteStep[]
}

// ────────────────────────────────────────────────────────────
// Template
// ────────────────────────────────────────────────────────────
export interface Template {
  id: string
  name: string
  type: TemplateType
  subject?: string
  body: string
  placeholders: string[]
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

// ────────────────────────────────────────────────────────────
// Notification Log
// ────────────────────────────────────────────────────────────
export interface NotificationLog {
  id: string
  channel: NotifChannel
  sr_id?: string
  activity_id?: string
  recipient: string
  subject?: string
  body: string
  template_id?: string
  status: 'sent' | 'failed'
  error_msg?: string
  sent_by?: string
  sent_at: string
}

// ────────────────────────────────────────────────────────────
// Audit Log
// ────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string
  action: string
  user_id?: string
  target_id?: string
  target_type?: string
  description?: string
  meta: Record<string, unknown>
  created_at: string
  user?: Pick<User, 'name' | 'role'>
}

// ────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────
export interface DashboardStats {
  total_sr: number
  open_sr: number
  in_progress_sr: number
  pending_sr: number
  closed_sr: number
  critical_open: number
  in_route: number
}

// ────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────
export interface AppSettings {
  general: {
    company_name: string
    sr_prefix: string
    timezone: string
    date_format: string
  }
  email: {
    smtp_host: string
    smtp_port: number
    smtp_user: string
    smtp_from: string
    smtp_from_name: string
  }
  drive: {
    root_folder_id: string
    sr_folder_id: string
    activities_folder_id: string
    apps_script_url: string
  }
  whatsapp: {
    bridge_url: string
    session_active: boolean
  }
}

// ────────────────────────────────────────────────────────────
// Permission helpers
// ────────────────────────────────────────────────────────────
export const ROLE_PERMISSIONS = {
  Admin:     { level: 5, canCreateSR: true,  canCloseSR: true,  canAdvanceRoute: true, canEditRoutes: true,  canManageUsers: true,  canReassign: true  },
  Manager:   { level: 4, canCreateSR: true,  canCloseSR: true,  canAdvanceRoute: true, canEditRoutes: true,  canManageUsers: false, canReassign: true  },
  Technical: { level: 3, canCreateSR: true,  canCloseSR: true,  canAdvanceRoute: true, canEditRoutes: false, canManageUsers: false, canReassign: false },
  User:      { level: 2, canCreateSR: true,  canCloseSR: false, canAdvanceRoute: false,canEditRoutes: false, canManageUsers: false, canReassign: false },
  Viewer:    { level: 1, canCreateSR: false, canCloseSR: false, canAdvanceRoute: false,canEditRoutes: false, canManageUsers: false, canReassign: false },
} as const

export function can(role: UserRole, permission: Exclude<keyof typeof ROLE_PERMISSIONS.Admin, 'level'>): boolean {
  const val = ROLE_PERMISSIONS[role]?.[permission]
  return typeof val === 'boolean' ? val : false
}

export const PRIORITY_COLOR: Record<SRPriority, string> = {
  Low:      '#6B7280',
  Medium:   '#D4A800',
  High:     '#E05555',
  Critical: '#FF2D2D',
}

export const STATUS_COLOR: Record<SRStatus, string> = {
  Open:        '#3B9EFF',
  'In Progress':'#00D4AA',
  Pending:     '#D4A800',
  Closed:      '#6B7280',
  Archived:    '#374151',
}
