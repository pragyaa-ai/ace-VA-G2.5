# AceNgage Exit Interview Scheduler - Test Cases Document

**Version:** 1.7.0  
**Last Updated:** February 3, 2026  
**Module:** VoiceAgent Callouts for Exit Interviews

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Data Management Tests](#2-data-management-tests)
3. [Callout Scheduling Tests](#3-callout-scheduling-tests)
4. [Call Triggering Tests](#4-call-triggering-tests)
5. [VoiceAgent Conversation Tests](#5-voiceagent-conversation-tests)
6. [Outcome Tracking Tests](#6-outcome-tracking-tests)
7. [Acengage API Integration Tests](#7-acengage-api-integration-tests)
8. [Analytics Dashboard Tests](#8-analytics-dashboard-tests)
9. [UI/UX Feature Tests](#9-uiux-feature-tests)
10. [Authentication & Authorization Tests](#10-authentication--authorization-tests)
11. [Error Handling & Edge Cases](#11-error-handling--edge-cases)
12. [Performance Tests](#12-performance-tests)

---

## 1. Test Environment Setup

### Prerequisites
- [ ] Admin UI accessible at `https://acengageva2.pragyaa.ai/`
- [ ] Telephony service running (`acengage-telephony`)
- [ ] Database accessible (PostgreSQL on port 5435)
- [ ] Elision API credentials configured
- [ ] Acengage API credentials configured
- [ ] Test phone numbers available

### Test Accounts
| Username | Password | Role | Purpose |
|----------|----------|------|---------|
| admin | OneView01! | ADMIN | Full access testing |
| acengage | AceNgage2024! | USER | Limited access testing |

---

## 2. Data Management Tests

### 2.1 Acengage API Data Pull

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| DM-001 | Pull data from Acengage API | 1. Go to Acengage tab<br>2. Click "Pull Data from API" | Employee records fetched and displayed | |
| DM-002 | Pull data with empty response | 1. Test with campaign having no data | "No new records to import" message | |
| DM-003 | Pull data with duplicate records | 1. Pull data twice for same campaign | Existing records updated, no duplicates created | |
| DM-004 | Verify phone number format | 1. Pull data with various phone formats (+91, 91, without code) | All phone numbers normalized correctly | |

### 2.2 Manual Data Entry

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| DM-005 | Add single employee record | 1. Click "Add Employee"<br>2. Fill all fields<br>3. Submit | Record created and appears in Callouts tab | |
| DM-006 | Add record with missing required fields | 1. Leave Name or Phone empty<br>2. Submit | Validation error shown | |
| DM-007 | Add record with invalid phone format | 1. Enter phone with special characters<br>2. Submit | Validation error for phone format | |
| DM-008 | Add duplicate phone number | 1. Add employee with existing phone | Error or update existing record | |

### 2.3 Excel/CSV Upload

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| DM-009 | Upload valid Excel file | 1. Download template<br>2. Fill data<br>3. Upload file | All records imported successfully | |
| DM-010 | Upload CSV file | 1. Prepare CSV with correct headers<br>2. Upload | Records imported | |
| DM-011 | Upload with missing columns | 1. Upload file without required columns | Error indicating missing columns | |
| DM-012 | Upload with invalid data | 1. Upload file with invalid phone numbers | Valid records imported, errors reported for invalid | |
| DM-013 | Upload empty file | 1. Upload file with only headers | "No records found" message | |
| DM-014 | Upload large file (100+ records) | 1. Upload file with many records | All records processed, progress shown | |

---

## 3. Callout Scheduling Tests

### 3.1 Schedule Configuration

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| CS-001 | Enable callout scheduling | 1. Go to Acengage tab<br>2. Toggle "Enable Scheduling"<br>3. Save | Scheduling enabled, scheduler starts | |
| CS-002 | Set daily time window | 1. Set start time: 10:00 AM<br>2. Set end time: 6:00 PM<br>3. Save | Calls only triggered within window | |
| CS-003 | Set attempts per day | 1. Set attempts to 5<br>2. Save<br>3. Trigger calls | Maximum 5 calls per day per employee | |
| CS-004 | Set max attempts (total) | 1. Set max attempts to 3<br>2. Test employee through 3 attempts | No more calls after 3 attempts | |
| CS-005 | Set call interval | 1. Set interval to 2 hours<br>2. Trigger first call<br>3. Check next call time | Next call scheduled 2+ hours later | |
| CS-006 | Update attempts per day above 10 | 1. Set attempts to 20<br>2. Save | Value saved successfully (max 100) | |

### 3.2 Schedule Execution

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| CS-007 | Automatic call triggering | 1. Enable scheduling<br>2. Wait for scheduled time | Calls triggered automatically | |
| CS-008 | Respect time window - before | 1. Set window 10 AM - 6 PM<br>2. Check at 9 AM | No calls triggered | |
| CS-009 | Respect time window - after | 1. Check after 6 PM | No calls triggered | |
| CS-010 | Weekend handling | 1. Check on Saturday/Sunday | Calls triggered or skipped per config | |

---

## 4. Call Triggering Tests

### 4.1 Manual Test Calls

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| CT-001 | Trigger test call | 1. Go to Callouts tab<br>2. Click "Trigger Test Call"<br>3. Enter phone number | Call initiated to phone number | |
| CT-002 | Test call appears in Callouts | 1. Trigger test call<br>2. Check Callouts tab | Test call record visible with status | |
| CT-003 | Test call with country code | 1. Enter phone with +91 prefix | Call initiated successfully | |
| CT-004 | Test call without country code | 1. Enter 10-digit phone | Call initiated successfully | |
| CT-005 | Test call to invalid number | 1. Enter invalid number<br>2. Trigger call | Appropriate error shown | |

### 4.2 Scheduled Calls

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| CT-006 | Scheduled call triggers | 1. Add pending employee<br>2. Wait for schedule | Call initiated automatically | |
| CT-007 | Call with employee metadata | 1. Check Elision API payload | Employee name, ID, company included | |
| CT-008 | WebSocket URL in comments | 1. Check Elision API request | `comments` contains correct WebSocket URL | |

---

## 5. VoiceAgent Conversation Tests

### 5.1 Call Connection

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| VC-001 | Call connects successfully | 1. Answer incoming call | WebSocket established, audio streams | |
| VC-002 | Initial greeting timing | 1. Answer call<br>2. Time until first words | Greeting within 2-3 seconds | |
| VC-003 | Initial greeting content | 1. Listen to greeting | "Hello [Name], this is regarding your exit interview..." | |

### 5.2 Conversation Scenarios

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| VC-004 | Schedule callback - date & time | 1. Answer call<br>2. Provide date and time<br>3. Confirm | Callback scheduled, confirmation given | |
| VC-005 | Schedule callback - date only | 1. Provide only date<br>2. Agent asks for time | Agent prompts for time slot | |
| VC-006 | Schedule callback - time only | 1. Provide only time<br>2. Agent asks for date | Agent prompts for date | |
| VC-007 | Reschedule request | 1. Ask to change scheduled time | Agent offers new options | |
| VC-008 | Decline interview | 1. Say "I don't want to do interview" | Agent acknowledges, asks reason | |
| VC-009 | Already resigned | 1. Say "I've already left the company" | Agent handles appropriately | |
| VC-010 | Request human callback | 1. Ask "Can someone call me back?" | Agent notes and confirms | |

### 5.3 Edge Conversation Cases

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| VC-011 | No response from user | 1. Answer call<br>2. Stay silent | Agent prompts again, then ends call | |
| VC-012 | Background noise | 1. Answer with background noise | Agent continues conversation | |
| VC-013 | Multiple interruptions | 1. Interrupt agent multiple times | Barge-in works, agent responds | |
| VC-014 | Foreign language response | 1. Respond in Hindi | Agent responds appropriately | |
| VC-015 | Very long response | 1. Give lengthy explanation | Agent captures key points | |
| VC-016 | Unclear audio | 1. Speak unclearly | Agent asks for clarification | |

### 5.4 Call Termination

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| VC-017 | Normal call end | 1. Complete scheduling<br>2. Say goodbye | Call ends gracefully | |
| VC-018 | User hangs up | 1. Hang up mid-conversation | Session ends, outcome recorded | |
| VC-019 | User says "bye" | 1. Say "bye" or "thank you bye" | Agent says goodbye, call ends | |
| VC-020 | User disconnects | 1. Lose connection | Outcome recorded as DISCONNECTED | |

---

## 6. Outcome Tracking Tests

### 6.1 Outcome Recording

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| OT-001 | Successful scheduling | 1. Complete scheduling flow | Status: COMPLETED, Outcome: callback_scheduled | |
| OT-002 | Call not answered | 1. Let call ring, don't answer | Status: FAILED, Outcome: not_answered | |
| OT-003 | User declined | 1. Decline during call | Status: COMPLETED, Outcome: declined | |
| OT-004 | Incomplete conversation | 1. Hang up mid-conversation | Status: COMPLETED, Outcome: incomplete | |
| OT-005 | User busy | 1. Reject call | Status: FAILED, Outcome: busy | |
| OT-006 | Invalid number | 1. Call invalid number | Status: FAILED, Outcome: invalid_number | |

### 6.2 VoiceAgent Analysis

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| OT-007 | Transcript saved | 1. Complete call<br>2. Check Callouts | Full transcript available | |
| OT-008 | Summary generated | 1. Check completed call | Summary of conversation present | |
| OT-009 | Sentiment analysis | 1. Check completed call | Sentiment: positive/neutral/negative | |
| OT-010 | Callback date extracted | 1. Schedule callback<br>2. Check outcome | Correct date extracted | |
| OT-011 | Callback time extracted | 1. Schedule callback<br>2. Check outcome | Correct time extracted | |
| OT-012 | Reason captured | 1. Decline with reason<br>2. Check outcome | Reason recorded in extracted_data | |

---

## 7. Acengage API Integration Tests

### 7.1 Status Updates

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AA-001 | Post successful callback | 1. Schedule callback<br>2. Check Acengage | Status updated with date/time | |
| AA-002 | Post not answered | 1. Call not answered<br>2. Check logs | non_contactable_status_node_id: 718 posted | |
| AA-003 | Post declined | 1. User declines<br>2. Check logs | Appropriate status posted | |
| AA-004 | Post with notes | 1. Complete call<br>2. Check Acengage payload | Notes contain outcome and sentiment | |
| AA-005 | API error handling | 1. Simulate API failure | Error logged, retry logic works | |

### 7.2 Payload Validation

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AA-006 | Callback payload format | 1. Check successful callback POST | Contains: callback_date, callback_time, notes | |
| AA-007 | Incomplete payload format | 1. Check incomplete call POST | Contains: non_contactable_status_node_id, callback_date: null | |
| AA-008 | Employee ID mapping | 1. Check POST URL | Correct employee_id in URL path | |

---

## 8. Analytics Dashboard Tests

### 8.1 Summary Cards

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AN-001 | Total calls count | 1. Go to Analytics tab | Correct total call count displayed | |
| AN-002 | Successful callbacks count | 1. Check summary card | Count matches completed callbacks | |
| AN-003 | Average sentiment score | 1. Check sentiment card | Score calculated correctly | |
| AN-004 | Completion rate | 1. Check rate card | Percentage accurate | |

### 8.2 Charts

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AN-005 | Call volume chart | 1. Check line chart | Daily call volumes displayed | |
| AN-006 | Outcome distribution pie | 1. Check pie chart | Outcomes shown with percentages | |
| AN-007 | Sentiment distribution | 1. Check sentiment chart | Positive/neutral/negative breakdown | |
| AN-008 | Company-wise breakdown | 1. Check bar chart | Calls grouped by company | |

### 8.3 Filters

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AN-009 | Filter by date range | 1. Select last 7 days | Data filtered correctly | |
| AN-010 | Filter by company | 1. Select specific company | Only company data shown | |
| AN-011 | Filter by outcome | 1. Select "callback_scheduled" | Only scheduled callbacks shown | |
| AN-012 | Combined filters | 1. Apply multiple filters | Intersection of filters applied | |

---

## 9. UI/UX Feature Tests

### 9.1 Callouts Tab

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| UI-001 | View callouts list | 1. Go to Callouts tab | All callout records displayed | |
| UI-002 | Expand row details | 1. Click on a row | Detailed analysis shown | |
| UI-003 | Filter by date | 1. Select date filter | Records filtered by date | |
| UI-004 | Filter by company | 1. Select company filter | Records filtered by company | |
| UI-005 | Filter by outcome | 1. Select outcome filter | Records filtered by outcome | |
| UI-006 | Export to Excel | 1. Click Export button | Excel file downloaded | |
| UI-007 | Export with filters | 1. Apply filters<br>2. Export | Only filtered data exported | |

### 9.2 Reset Feature

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| UI-008 | Reset to Pending | 1. Find completed record<br>2. Click "Reset to Pending" | Status changes to PENDING | |
| UI-009 | Reset clears attempts | 1. Reset a record<br>2. Check attempts | Total attempts reset to 0 | |
| UI-010 | Reset allows re-calling | 1. Reset record<br>2. Trigger call | New call initiated successfully | |

### 9.3 Navigation

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| UI-011 | Analytics as first tab | 1. Open VoiceAgent page | Analytics tab is first/default | |
| UI-012 | Tab navigation | 1. Click through all tabs | All tabs load correctly | |
| UI-013 | Breadcrumb navigation | 1. Use breadcrumbs | Navigate back correctly | |

---

## 10. Authentication & Authorization Tests

### 10.1 Login

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AU-001 | Admin login | 1. Login as admin<br>2. Check access | Full access to all features | |
| AU-002 | User login | 1. Login as acengage<br>2. Check access | Limited access (no Telephony tab) | |
| AU-003 | Invalid credentials | 1. Enter wrong password | "Invalid credentials" error | |
| AU-004 | Google OAuth login | 1. Click Google login<br>2. Complete OAuth | Login successful | |
| AU-005 | Session persistence | 1. Login<br>2. Refresh page | Stay logged in | |
| AU-006 | Logout | 1. Click logout | Redirected to login page | |

### 10.2 Authorization

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| AU-007 | Telephony tab - Admin | 1. Login as admin<br>2. Check tabs | Telephony tab visible | |
| AU-008 | Telephony tab - User | 1. Login as acengage<br>2. Check tabs | Telephony tab NOT visible | |
| AU-009 | Direct URL access - Admin | 1. Admin accesses /telephony | Page loads | |
| AU-010 | Direct URL access - User | 1. User accesses /telephony | Access denied or redirect | |

---

## 11. Error Handling & Edge Cases

### 11.1 Network Errors

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| EH-001 | Elision API timeout | 1. Simulate slow Elision API | Timeout error handled gracefully | |
| EH-002 | Acengage API down | 1. Simulate Acengage unavailable | Error logged, local status updated | |
| EH-003 | Database connection lost | 1. Simulate DB disconnect | Error shown, recovery on reconnect | |
| EH-004 | WebSocket disconnect | 1. Drop WebSocket mid-call | Call ends, outcome recorded | |

### 11.2 Data Edge Cases

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| EH-005 | Very long employee name | 1. Import name with 100+ chars | Handled without truncation | |
| EH-006 | Special characters in name | 1. Import name with apostrophes, etc. | Handled correctly | |
| EH-007 | Unicode characters | 1. Import non-ASCII characters | Displayed correctly | |
| EH-008 | Empty company field | 1. Import record without company | Default value or empty handled | |

### 11.3 Concurrent Operations

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| EH-009 | Multiple simultaneous calls | 1. Trigger multiple calls at once | All calls processed independently | |
| EH-010 | Concurrent data pull | 1. Two users pull data simultaneously | No duplicate records | |
| EH-011 | Simultaneous reset | 1. Reset same record from two sessions | Handled without error | |

---

## 12. Performance Tests

### 12.1 Response Times

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| PF-001 | Page load time | 1. Measure Analytics page load | < 3 seconds | |
| PF-002 | Data pull time | 1. Measure Acengage API pull | < 10 seconds for 100 records | |
| PF-003 | Call trigger time | 1. Measure time to initiate call | < 2 seconds | |
| PF-004 | AI response time | 1. Measure VoiceAgent greeting | < 3 seconds after answer | |

### 12.2 Load Tests

| TC ID | Test Case | Steps | Expected Result | Status |
|-------|-----------|-------|-----------------|--------|
| PF-005 | 100 concurrent callouts | 1. Import 100 pending records<br>2. Enable scheduling | All calls processed without errors | |
| PF-006 | Large dataset export | 1. Export 1000+ records | Export completes < 30 seconds | |
| PF-007 | Analytics with large data | 1. View analytics with 10,000+ calls | Charts load < 5 seconds | |

---

## Test Execution Checklist

### Pre-Test
- [ ] Verify test environment is accessible
- [ ] Confirm test phone numbers are available
- [ ] Check all services are running
- [ ] Clear test data if needed

### Post-Test
- [ ] Document all failures
- [ ] Create bug reports for issues
- [ ] Update test status
- [ ] Clean up test data

---

## Defect Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| Critical | System unusable | Calls not triggering at all |
| High | Major feature broken | Outcomes not saving |
| Medium | Feature partially working | Filters not applying correctly |
| Low | Minor issue | UI alignment problems |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev Lead | | | |
| Product Owner | | | |

---

*Document maintained by: Pragyaa AI Team*
