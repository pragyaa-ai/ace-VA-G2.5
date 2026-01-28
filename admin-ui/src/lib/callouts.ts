export type AcengageConfig = {
  getUrl: string;
  updateUrlTemplate: string;
  employeeIdField: string;
  phoneField: string;
  nameField: string;
  companyField: string;
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
  phoneField: "mobile",  // Acengage API uses 'mobile' field
  nameField: "name",
  companyField: "company",
};

// Helper to safely extract a string field from employee record (case-insensitive)
export const safeExtractField = (
  employee: Record<string, unknown>,
  primaryField: string,
  fallbackFields: string[] = []
): string | null => {
  const fields = [primaryField, ...fallbackFields];
  const employeeKeys = Object.keys(employee);
  
  for (const field of fields) {
    // Try exact match first
    let value = employee[field];
    
    // If not found, try case-insensitive match
    if (value === null || value === undefined) {
      const matchingKey = employeeKeys.find(
        (k) => k.toLowerCase() === field.toLowerCase()
      );
      if (matchingKey) {
        value = employee[matchingKey];
      }
    }
    
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
};

export const DEFAULT_CALLOUT_SCHEDULE: CalloutScheduleConfig = {
  isActive: true,
  runAtLocalTime: "11:00",
  timezone: "Asia/Kolkata",
  attemptsPerDay: 3,
  maxDays: 2,
  escalationEnabled: true,
};
