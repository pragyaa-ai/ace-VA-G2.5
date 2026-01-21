export type AcengageConfig = {
  getUrl: string;
  updateUrlTemplate: string;
  employeeIdField: string;
  phoneField: string;
};

export type CalloutScheduleConfig = {
  isActive: boolean;
  runAtLocalTime: string;
  timezone: string;
  attemptsPerDay: number;
  maxDays: number;
  escalationEnabled: boolean;
};

export const DEFAULT_ACENGAGE_CONFIG: AcengageConfig = {
  getUrl: "https://api-app.acengage.com/campaign/bot/get_nc_employees/1",
  updateUrlTemplate: "https://api-app.acengage.com/campaign/bot/update_nc_schedule/{employeeId}",
  employeeIdField: "id",
  phoneField: "phone_number",
};

export const DEFAULT_CALLOUT_SCHEDULE: CalloutScheduleConfig = {
  isActive: true,
  runAtLocalTime: "11:00",
  timezone: "Asia/Kolkata",
  attemptsPerDay: 3,
  maxDays: 2,
  escalationEnabled: true,
};
