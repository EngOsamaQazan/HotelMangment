---
name: ad-campaign-optimizer
description: Optimize digital advertising campaigns across Meta, TikTok, Snapchat, Google, and LinkedIn. Use when creating ad campaigns, analyzing ad performance, optimizing budgets, setting up A/B tests, targeting audiences, or improving ROAS and CPA metrics.
---

# Ad Campaign Optimizer

## Campaign Creation Framework

### Step 1: Define Campaign Objective

Map business goals to platform objectives:

| Business Goal | Meta Objective | TikTok Objective | Google Objective |
|--------------|---------------|-----------------|-----------------|
| Brand Awareness | Awareness | Reach | Display/Video |
| Website Traffic | Traffic | Traffic | Search/Display |
| Engagement | Engagement | Community Interaction | - |
| Lead Generation | Leads | Lead Generation | Search/Display |
| App Installs | App Promotion | App Install | App Campaign |
| Sales | Sales | Website Conversions | Shopping/PMax |

### Step 2: Audience Targeting

**Layered Targeting Approach:**

```
Layer 1 - Demographics:
├── Age range (aligned with buyer persona)
├── Gender
├── Location (country → city → radius)
└── Language

Layer 2 - Interests:
├── Industry-related interests
├── Competitor followers/engagers
├── Related hobbies and behaviors
└── Life events (if relevant)

Layer 3 - Custom Audiences:
├── Website visitors (pixel data)
├── Customer list uploads
├── App users
└── Video viewers / Post engagers

Layer 4 - Lookalike Audiences:
├── 1% lookalike of best customers
├── 1-3% lookalike of converters
└── 5-10% lookalike for awareness
```

### Step 3: Budget Optimization Rules

**Auto-optimization triggers:**

```
IF CPA > target_cpa * 1.5 AND impressions > 1000:
  → Pause ad set, reallocate budget

IF CTR < 0.5% AND impressions > 2000:
  → Flag for creative refresh

IF ROAS > target_roas * 1.5:
  → Increase budget by 20% (max once per 48h)

IF frequency > 3.0:
  → Expand audience or refresh creative

IF spend > daily_budget * 0.8 AND conversions == 0:
  → Alert manager, suggest pausing
```

### Step 4: A/B Testing Protocol

Test one variable at a time:

| Priority | Variable | Variants | Min Budget | Min Duration |
|----------|----------|----------|-----------|-------------|
| 1 | Creative (image/video) | 2-3 | $20/variant/day | 3 days |
| 2 | Headline/Copy | 2-3 | $15/variant/day | 3 days |
| 3 | Audience | 2-3 | $20/variant/day | 5 days |
| 4 | Placement | 2-3 | $15/variant/day | 3 days |
| 5 | CTA button | 2 | $10/variant/day | 3 days |

**Winner criteria:** Statistical significance > 90%, minimum 100 conversions combined.

## Performance Benchmarks (Middle East 2025-2026)

### Meta Ads (Facebook + Instagram)

| Metric | Poor | Average | Good | Excellent |
|--------|------|---------|------|-----------|
| CTR (Link) | < 0.5% | 0.5-1% | 1-2% | > 2% |
| CPC | > $1.5 | $0.5-1.5 | $0.2-0.5 | < $0.2 |
| CPM | > $15 | $5-15 | $2-5 | < $2 |
| CPA (Lead) | > $20 | $10-20 | $5-10 | < $5 |
| ROAS | < 2x | 2-4x | 4-8x | > 8x |
| Frequency | > 4 | 2-4 | 1-2 | 1-1.5 |

### TikTok Ads

| Metric | Poor | Average | Good | Excellent |
|--------|------|---------|------|-----------|
| CTR | < 0.3% | 0.3-0.8% | 0.8-1.5% | > 1.5% |
| CPM | > $12 | $5-12 | $2-5 | < $2 |
| Video View Rate | < 15% | 15-25% | 25-40% | > 40% |

## Campaign Health Check (Run Daily)

```
For each active campaign:
1. Check spend vs budget (alert if > 90%)
2. Check CPA vs target (flag if > 1.3x)
3. Check frequency (flag if > 3)
4. Check CTR trend (flag if declining 3 days)
5. Check conversion rate (flag if < baseline)
6. Score campaign health: 🟢 Healthy | 🟡 Monitor | 🔴 Action Needed
```

## Ad Copy Best Practices (Arabic)

- Lead with the benefit, not the feature
- Use numbers and statistics when possible
- Create urgency without being pushy
- Match the dialect to the target country
- Keep primary text under 125 characters for mobile
- Use emojis strategically (1-3 per ad)
- Strong CTA: "اطلب الآن" / "سجل مجاناً" / "احصل على عرضك"
