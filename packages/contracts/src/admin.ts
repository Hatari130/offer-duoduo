export type AdminDashboardRangeDays = 7 | 30 | 90;

export interface AdminDashboardOverview {
  totalUsers: number;
  newUsers: number;
  activeUsers: number;
  conversations: number;
  userMessages: number;
  assistantMessages: number;
  chatSuccessRate: number | null;
  positiveFeedbackRate: number | null;
}

export interface AdminDashboardDailyPoint {
  date: string;
  registrations: number;
  activeChatUsers: number;
  conversations: number;
  messages: number;
}

export interface AdminDashboardBreakdownItem {
  key: string;
  label: string;
  value: number;
}

export interface AdminDashboardFeatureUsage {
  applications: number;
  resumeVersions: number;
  interviewRecords: number;
  usersWithApplications: number;
}

export interface AdminDashboardRecentUser {
  id: string;
  displayName: string;
  maskedEmail: string;
  createdAt: string;
  lastActiveAt?: string;
  conversationCount: number;
  applicationCount: number;
}

export interface AdminDashboardResponse {
  generatedAt: string;
  rangeDays: AdminDashboardRangeDays;
  overview: AdminDashboardOverview;
  daily: AdminDashboardDailyPoint[];
  messageStatuses: AdminDashboardBreakdownItem[];
  feedbackCategories: AdminDashboardBreakdownItem[];
  feedbackStatuses: AdminDashboardBreakdownItem[];
  featureUsage: AdminDashboardFeatureUsage;
  recentUsers: AdminDashboardRecentUser[];
}
