---
name: report-designer
description: Design and generate professional PDF reports for marketing plans and monthly achievement reports. Use when creating marketing plan PDFs, monthly performance reports, generating charts and analytics summaries, or building report templates with React-PDF.
---

# Marketing Report Designer

## Report Types

### 1. Marketing Plan PDF (خطة تسويق شهرية)

**Structure:**
```
Page 1:  Cover page (logos, title, date, client name)
Page 2:  Table of contents
Page 3:  Executive summary (objectives, platforms, budget)
Page 4:  Current state analysis (previous month data if available)
Page 5:  Target audience profile (demographics, personas)
Page 6:  Platform strategy (which platforms and why)
Page 7:  Content calendar overview (calendar grid)
Page 8:  Content themes and types breakdown
Page 9:  Paid advertising plan (campaigns, budgets, audiences)
Page 10: Budget breakdown (pie chart + table)
Page 11: KPIs and success metrics
Page 12: Timeline and milestones
```

### 2. Monthly Achievement Report (تقرير إنجازات شهري)

**Structure:**
```
Page 1:  Cover page
Page 2:  Executive summary (key wins, overall performance)
Page 3:  KPI scorecard (target vs actual, with color coding)
Page 4:  Overall metrics dashboard (reach, engagement, followers)
Page 5:  Platform-by-platform performance
Page 6:  Top performing content (with screenshots/thumbnails)
Page 7:  Advertising performance (campaigns, spend, ROI)
Page 8:  Budget utilization (planned vs actual spend)
Page 9:  Audience growth and demographics
Page 10: Competitor comparison (if data available)
Page 11: AI insights and recommendations
Page 12: Next month preview and recommendations
```

## Design System for PDFs

### Color Palette
```
Primary:    #1A1A2E (Dark Navy - headers, text)
Secondary:  #16213E (Deep Blue - subheaders)
Accent:     #0F3460 (Royal Blue - highlights)
Success:    #00B894 (Green - positive metrics)
Warning:    #FDCB6E (Yellow - caution metrics)
Danger:     #E17055 (Red - negative metrics)
Background: #FFFFFF (White - main bg)
Light BG:   #F8F9FA (Light Gray - section bg)
```

### Typography
```
Headers:    Cairo Bold (Arabic-friendly, professional)
Subheaders: Cairo SemiBold
Body:       Cairo Regular
Numbers:    Roboto Mono (for statistics/data)
```

### Chart Types by Data

| Data Type | Chart | Library |
|-----------|-------|---------|
| Budget distribution | Pie/Donut | recharts |
| Monthly trends | Line chart | recharts |
| Platform comparison | Bar chart | recharts |
| KPI progress | Gauge/Progress | custom |
| Content performance | Horizontal bar | recharts |
| Audience demographics | Stacked bar | recharts |

## React-PDF Component Structure

```
ReportDocument
├── CoverPage
│   ├── CompanyLogo
│   ├── ClientLogo
│   ├── ReportTitle
│   └── DateRange
├── TableOfContents
├── ExecutiveSummary
│   ├── KeyMetrics (3-4 highlight cards)
│   └── SummaryText
├── PlatformPerformance
│   ├── PlatformCard (per platform)
│   │   ├── PlatformIcon
│   │   ├── MetricsGrid
│   │   └── TrendChart
│   └── ComparisonChart
├── ContentAnalysis
│   ├── TopPosts (with thumbnails)
│   └── ContentTypeBreakdown
├── AdvertisingReport
│   ├── CampaignTable
│   ├── SpendChart
│   └── ROIAnalysis
├── BudgetReport
│   ├── BudgetPieChart
│   └── PlannedVsActual
├── AIInsights
│   ├── InsightCards
│   └── Recommendations
└── Footer (page numbers, company info)
```

## KPI Scorecard Format

```
┌────────────────────┬──────────┬──────────┬─────────┬────────┐
│ KPI                │ Target   │ Actual   │ Status  │ Change │
├────────────────────┼──────────┼──────────┼─────────┼────────┤
│ Total Reach        │ 100,000  │ 125,000  │ 🟢 125% │ +25%   │
│ Engagement Rate    │ 3.5%     │ 4.2%     │ 🟢 120% │ +0.7%  │
│ New Followers      │ 500      │ 420      │ 🟡 84%  │ -80    │
│ Leads Generated    │ 50       │ 62       │ 🟢 124% │ +12    │
│ Ad ROAS            │ 4x       │ 3.2x    │ 🔴 80%  │ -0.8x  │
│ Content Published  │ 30       │ 28       │ 🟡 93%  │ -2     │
└────────────────────┴──────────┴──────────┴─────────┴────────┘

Status colors:
🟢 >= 100% of target
🟡 >= 80% of target
🔴 < 80% of target
```

## Report Generation Workflow

1. **Collect data** from all connected platforms via APIs
2. **Aggregate metrics** into standardized format
3. **Run AI analysis** on the data (Claude)
4. **Generate charts** as SVG/PNG for PDF embedding
5. **Compile report** using React-PDF template
6. **Generate PDF** and upload to Supabase Storage
7. **Notify client** via push notification + email
8. **Log generation** in ai_activity_log

## Localization

- All reports support RTL layout
- Arabic content uses Cairo font
- Numbers can be displayed in Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) or Western (0123456789) based on client preference
- Date format: DD/MM/YYYY or Hijri calendar option
- Currency: Display in client's local currency (SAR, AED, EGP, JOD, USD)
