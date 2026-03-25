# Sales Forecast Management App — Implementation Plan

*Open items that need your decision are listed in **§7 Items to Confirm (Pending)** (items 4–15); answers for 1–3 are recorded.*

## 1. Advice Summary

| Area | Recommendation |
|------|----------------|
| **Product attributes** | Configurable; can be assembled as a hierarchy (e.g., Brand → Model → Size → Color). |
| **Channel dimension** | Configurable hierarchy (e.g., All → Region → Agent → Country → Customer). |
| **Forecast dimensions** | Forecast = **Product** × **Channel** × Period × Quantity. |
| **Forecast type** | **Long-term plan** (BU-scoped) vs **Rolling production** (Company/Plant). Org hierarchy: Group → BU → Company → Plant. |
| **Forecasting origin** | Configurable (marketing, manager judgement, finance target, etc.). |
| **Template generation** | App generates upload template from product/channel/origin config. |
| **Adjustment & allocation** | Manager chooses axis (by channel or by product), selects level + value on scope dimension; allocation % on chosen dimension breaks down to children. % can be defined for **all** or per **VersionOrigin**. |
| **Organization scope** | Full hierarchy: **Group → BU → Company → Plant**. Long-term planning is **BU**-scoped; rolling forecast is Company/Plant/Sales. |
| **Version (time)** | **LTP**: `LTP-2026Q1-A` (quarter + sequence). **Rolling**: `RFC-202603-A` (year+month + sequence). |
| **Version × Origin** | Both LTP and rolling: multiple origins; each has status (draft/submitted); only one origin **activated**; manager adjustment supported for both. |
| **Analysis** | Compare long-term plan vs rolling production forecast. |
| **Period config by forecast type** | Length and frequency defined per type: long-term (e.g., 12 quarters, annual update) vs rolling (e.g., 13 weeks, weekly update). |
| **Zero vs. not updated** | Explicit 0 = user entered; NULL/empty = not entered (forgot). Configurable how to treat/highlight "not updated" cells. |
| **ERP sync** | Manual trigger; for rolling production consolidated view. |
| **Import** | Excel/CSV; template-based; material mapping via integration API. |

**Adopted suggestions (in plan):** Optional approval workflow; notifications (version/origin/sync/freeze); upload validation & partial import; audit trail; copy/clone version; carry-forward; export; dashboard; concurrent-edit handling; hierarchy versioning/soft-delete; performance (pagination, aggregation); allocation % sum validation.

---

## 2. Proposed Data Model (Conceptual)

### 2.1 Organization Hierarchy

**Full hierarchy: Group → BU → Company → Plant.** Long-term planning is carried by **BU**; rolling forecast by Company/Plant/Sales.

```
Group (top level)
├── id, name, code
└── BUs[]

BU (Business Unit; owns long-term planning)
├── id, groupId, name, code
├── Companies[]
├── Long-term plans (forecastType = LONG_TERM_PLAN)
└── Users (many-to-many, BU scope)

Company (legal entity; rolling production)
├── id, buId, name, type (manufacturing | sales), timezone
├── Plants (optional; manufacturing has plants, sales companies have none)
├── Users (many-to-many)
├── Sales, Connectors, FreezeRules
└── Consolidated view = aggregation of Sales forecasts (rolling only)

Plant (optional, under Company)
├── id, companyId, name, code
├── Sales (if plant exists)
└── Sales companies have no plants

Sales (person or team/group; rolling only)
├── id, companyId, plantId? (nullable)
├── name, code, type (person | team)
└── Forecasts (rolling production only)
```

### 2.2 Configurable Product & Channel Hierarchies

```
Dimension (product | channel)
├── id, groupId?, buId?, companyId? (scope: Group/BU for LTP, Company for rolling)
├── name, code
└── Hierarchy definition

DimensionLevel (ordered levels in hierarchy)
├── dimensionId, levelOrder, name, code
├── parentLevelId? (null = top, e.g., "All")
└── Example: All(1) → Region(2) → Agent(3) → Country(4) → Customer(5)

DimensionNode (actual values, tree structure)
├── dimensionId, levelId
├── parentNodeId? (null = root)
├── code, name
├── unitOfMeasure? (for product nodes: pc, box, kg, etc.; configurable)
└── Product example: Brand A → Model X → Size M → Color Red
    Channel example: All → APAC → Agent01 → Japan → Customer ABC

ForecastOrigin (configurable)
├── id, companyId?, name, code
└── Examples: marketing, sales, planner, manager adjustment, finance target
```

### 2.3 Forecast Core

```
Forecast
├── belongs to: BU (long-term) or Sales/Company (rolling)
├── forecastType: LONG_TERM_PLAN | ROLLING_PRODUCTION
├── periodConfigId, mandatoryPeriodCount
└── Versions (time-based)

Version (time concept; naming depends on forecast type)
├── forecastType: LONG_TERM_PLAN | ROLLING_PRODUCTION
├── versionCode
│   ├── LTP: "LTP-2026Q1-A" (year + quarter + sequence)
│   └── Rolling: "RFC-202603-A" (year + month + sequence)
├── productionPlanningYear
├── productionPlanningQuarter? (LTP: e.g. 1–4)
├── productionPlanningMonth? (rolling: e.g. 01–12)
├── sequence: "A" | "B" | "C" (1st, 2nd, 3rd in that period)
├── scope: BU (LTP) or per-sales/consolidated (rolling)
└── VersionOrigins[] (one per forecasting origin; both LTP and rolling have multiple origins + manager adjustment)

VersionOrigin (forecast by origin within a version)
├── versionId
├── forecastOriginId (marketing | sales | planner | manager adjustment)
├── status: draft | submitted
├── isActivated: boolean (only one per version can be true; used for consolidation, ERP sync, analysis)
└── ForecastData (LTP and rolling both support manager adjustment)

ForecastData (product × channel × period)
├── versionOriginId
├── productNodeId (leaf or any level)
├── channelNodeId (leaf or any level)
├── periodKey
├── quantity (nullable)
│   └── NULL = not entered / forgot to update
│   └── 0 = user explicitly entered zero
│   └── >0 = entered value
├── price? (optional; for analysis: value = quantity × price)
├── currency? (optional; e.g. USD, EUR)
└── (origin is implied by versionOrigin)
```

**Version naming:**
- **Long-term:** `LTP-2026Q1-A` = year 2026, quarter Q1, sequence A (1st); B/C = 2nd, 3rd in that quarter.
- **Rolling:** `RFC-202603-A` = year 2026, month 03 (March), sequence A (1st); B/C = 2nd, 3rd in that month.
- Both LTP and rolling support multiple origins and manager adjustment; only one origin is activated per version.

**Zero vs. not updated:** Distinguish (a) user explicitly entered 0 from (b) user forgot to update. `quantity` nullable: NULL = not entered; 0 = explicit zero. Admin config: how to treat null (warning/zero/exclude), highlight not-updated cells.

### 2.4 Adjustment & Allocation

```
AllocationRule
├── dimensionId (product or channel)
├── levelId (at which level the rule applies)
├── parentNodeId
├── childNodeId
├── allocationPercentage (0–100)
├── versionOriginId? (nullable)
│   └── null = applies to ALL (global/default)
│   └── set = applies only to that VersionOrigin (overrides global)
└── Used when: (a) manager adjusts parent → distribute to children, (b) breakdown without explicit parent adjustment
```

**Scope:** Allocation % can be defined for **all** (global default) or for a specific **VersionOrigin**. VersionOrigin-specific rules override the global rule when applicable.

```
AdjustmentLog (audit)
├── versionOriginId, productNodeId?, channelNodeId?
├── periodKey, oldQuantity, newQuantity
├── adjustedAt, adjustedBy
├── allocationRun?: 1 | 2 (2 = second-run allocation; mark when Case 2 applied)
└── Trigger: manager edit at higher hierarchy level
```

### 2.5 Supporting Entities

```
PeriodConfig (per forecast type)
├── forecastType: LONG_TERM_PLAN | ROLLING_PRODUCTION
├── periodUnit: week | month | quarter
├── periodLength / forecastingHorizontal: number of periods (e.g., N; admin-configurable)
├── updateFrequency: e.g., annual, quarterly, monthly, weekly
├── periodKeyFormat (e.g., "2025-Q1", "2025-W01")
├── mandatoryPeriodCount (periods user must fill)
└── Different config per forecast type

ZeroVsNotUpdatedConfig (how to treat/highlight)
├── treatNullAs: "warning" | "zero" | "exclude" (configurable)
├── highlightNotUpdated: boolean (e.g., different color for NULL cells in UI)
├── mandatoryPeriodValidation: warn/block if NULL in mandatory periods
└── Per company or global

FreezeRule, Connector (unchanged)
- FreezeRule: companyId/plantId, applies to rolling production
- Connector: companyId, for ERP sync
```

### 2.6 Views Summary

| View | Forecast Type | Scope |
|------|---------------|-------|
| **Per-sales** | Rolling only | Single sales |
| **Consolidated** | Rolling only | Company/Plant |
| **Long-term plan** | Long-term | **BU** (one BU at a time) |
| **Analysis** | Both | Compare long-term (BU) vs rolling by product × channel × period |

---

## 3. Key Flows

### 3.1 Configurable Hierarchy Setup
1. Admin defines **Product dimension** levels and nodes.
2. Admin defines **Channel dimension** levels and nodes.
3. Admin defines **Forecast origins** (marketing, sales, planner, manager, etc.).
4. Admin defines **PeriodConfig per forecast type** (length, frequency, format, mandatory count).
5. Admin defines **Zero vs. not updated** behavior (treat null as warning/zero, highlight not-updated cells).

### 3.2 Version & Origin Flow
1. Create **Version** (time): **LTP** `LTP-2026Q1-A` (BU-scoped) or **Rolling** `RFC-202603-A` (Company/Plant).
2. Within version: upload or edit by **origin** (marketing, sales, planner, manager adjustment). **Both LTP and rolling** have multiple origins and support manager adjustment.
3. Each origin has **status**: draft | submitted.
4. **Only one origin** per version can be **activated** (used for consolidation, ERP sync, analysis).
5. Manager activates the final origin after review (e.g. manager adjustment).

### 3.3 Template Generation & Product Unit
- After config: app generates **upload template** (Excel/CSV).
- Template columns: product attributes, channel attributes, periods, quantity, origin (optionally unit).
- Template is scoped to: product hierarchy levels, channel hierarchy levels, period range.
- **Product unit:** configurable per product. First-time upload can update config. Conflict (same product, different units in same file or across versions/origins) → error. UI to correct unit if first upload was wrong.
- **Price/currency:** optional reference; if uploaded, used for analysis only (value = quantity × price).

### 3.4 Adjustment & Allocation
1. **Allocation %** is defined either for **all** (global default) or for a specific **VersionOrigin** (overrides global).
2. Manager **chooses adjustment axis**: **by channel** or **by product**. Then selects **level + value** on the other dimension (scope), and enters adjustment quantity.
3. **By channel:** scope by product (level + value) → allocation % distributes across channel children. **By product:** scope by channel (level + value) → allocation % distributes across product children.
4. System applies **allocation %** on the chosen dimension (VersionOrigin-specific if exists, else global).
5. **Breakdown without adjustment**: If allocation % is defined, parent value can be broken down to children even when manager did not explicitly adjust parent.
6. **Mark second-run allocation**: When Case 2 applies, record `allocationRun: 2` in AdjustmentLog for traceability.

### 3.5 Analysis
- Compare **long-term plan** vs **rolling production forecast**.
- By product × channel × period: variance, % difference, gap.

---

## 4. Phased Implementation Plan

### Phase 0: Foundation
- Monorepo: `frontend` / `backend`
- PostgreSQL + Prisma
- Basic Node.js API + React app
- Auth (JWT or session)
- **Bootstrap script** to create first admin user
- `MessageContext` on frontend

### Phase 1: Organizations (Group, BU, Company, Plant), Sales & Users
- `Group`, `BU`, `Company`, `Plant`, `User`, `OrganizationMembership`
- Hierarchy: Group → BU → Company → Plant (all orgs in this structure)
- `Sales` (person or team; companyId, optional plantId)
- CRUD for groups, BUs, companies, plants, sales
- User management and roles; membership at Group/BU/Company/Plant as needed
- *Long-term planning is BU-scoped; rolling production is Company/Plant/Sales*

### Phase 2: Configurable Product & Channel Hierarchies
- `Dimension`, `DimensionLevel`, `DimensionNode`
- Admin UI: define product hierarchy (levels, order, parent-child)
- Admin UI: define channel hierarchy
- **Product unit** (`unitOfMeasure`) configurable per product node (pc, box, kg, etc.)
- Support flat attributes (e.g., material number) and hierarchical attributes
- Product and channel are both configurable and hierarchical

### Phase 2b: Forecast Origin, Period Config & Zero Handling
- `ForecastOrigin` (configurable)
- `PeriodConfig` **per forecast type**: length, frequency, period unit/format, mandatory count (long-term vs rolling)
- `ZeroVsNotUpdatedConfig`: treat null as warning/zero, highlight not-updated cells, mandatory-period validation

### Phase 3: Forecast Grid & Versions (Product × Channel × Period)
- `Forecast`, `Version`, `VersionOrigin`, `ForecastData`
- **Version** = time concept: **LTP** `LTP-2026Q1-A` (BU-scoped), **Rolling** `RFC-202603-A` (Company/Plant)
- **VersionOrigin** = one per origin; status (draft/submitted); only one activated; **both LTP and rolling** have multiple origins and manager adjustment
- ForecastData: productNodeId × channelNodeId × periodKey × quantity, linked to VersionOrigin
- Version CRUD, VersionOrigin CRUD, activate one origin per version
- **Per-sales view** and **Consolidated view** (rolling only)
- **Long-term plan view** (BU-scoped)

### Phase 3b: Template Generation & Upload
- Generate upload template (Excel/CSV) from product/channel config
- Template columns: product attributes, channel attributes, periods, quantity (optionally unit)
- Scoped to Version + Origin (user selects version and origin when downloading)
- Download for users to fill and upload into the selected VersionOrigin
- **Product unit on upload:** first-time upload can update product unit in config; if same product has different units in same file or in later files (different version/origin) → show error; provide **UI to correct product unit** if first upload was wrong
- **Price/currency (optional):** if user uploads with price/currency, store as reference; used for analysis only (value = quantity × price)

### Phase 4: Adjustment & Allocation
- `AllocationRule` model (scoped to **all** or per **VersionOrigin**); per dimension (channel OR product)
- Admin UI: define allocation % at product/channel hierarchy levels
- Manager adjustment UI: choose axis (**by channel** or **by product**), select level + value on scope dimension, enter quantity; apply allocation to children on chosen dimension
- Breakdown logic: use allocation % to split parent → children (with or without explicit parent adjustment)
- `AdjustmentLog` for audit; **mark** `allocationRun: 2` when second-run allocation (Case 2) occurs

### Phase 5: Freeze Time Frame
- `FreezeRule` (company/plant, rolling only)
- Admin UI: freeze windows
- Backend: block edits in frozen periods unless `allowFrozenEdit`
- Admin toggle for freeze override

### Phase 6: Analysis (Long-term vs Rolling)
- Compare long-term plan vs rolling production forecast
- By product × channel × period: quantity diff, variance, %
- **Value analysis** (optional): when price/currency uploaded, derive value = quantity × price for pivot/key figures
- **Period alignment**: define how to align long-term (e.g. quarters) with rolling (e.g. weeks)—e.g. sum weeks to quarters or use common granularity (see Items to Confirm #9)
- Analysis UI: filters, pivot, export

### Phase 7: ERP Connectors & Sync
- `Connector`, `ConnectorFieldMapping`
- Manual sync: consolidated **rolling** forecast, **activated VersionOrigin** of selected Version → API
- Sync history and error handling

### Phase 8: Polish & Operations
- File import using generated template; material mapping via integration API
- **Product unit correction UI**: change product unit setting when first upload was wrong (admin/product config)
- **Upload validation**: row-level error report; option for partial import (skip invalid rows) vs reject all; product unit conflict detection (same product, different units → error)
- **Audit trail**: who uploaded, who changed status, who activated, who triggered sync (in addition to AdjustmentLog)
- **Notifications**: version created, origin submitted, origin activated, freeze window approaching, sync completed/failed (configurable triggers)
- **Copy/clone version**: clone existing Version or VersionOrigin as starting point for a new one
- **Carry-forward**: when creating new rolling version (e.g. 202604A), optionally auto-fill from previous version’s activated origin, shifted by one period
- **Export**: export forecast grid (with filters) as Excel/CSV
- **Dashboard**: landing view — versions in progress, submission status per origin, not-updated cell count, upcoming freeze windows
- Reporting, dashboards

### Phase 3 & 4 — Design Notes (from suggestions)
- **Optional approval workflow**: consider submitted → approved → activated; manager approves before activation (configurable per company).
- **Concurrent editing**: optimistic locking or last-write-wins with conflict detection when multiple users upload/edit the same VersionOrigin.
- **Hierarchy versioning**: soft-delete on DimensionNode; historical forecast data keeps referencing nodes; consider effectiveDate or snapshot for structural changes.
- **Performance**: Product × Channel × Period can be large; use pagination, lazy loading, server-side aggregation for consolidated view; consider materialized views or caching for heavy reports.
- **Allocation validation**: enforce children allocation % sum to 100% under a parent (with configurable tolerance or warning).

---

## 5. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  Company/Plant  │  Sales  │  Forecast Type (Long-term / Rolling)         │
│  Per-Sales / Consolidated  │  Product × Channel Grid  │  Version Mgmt    │
│  Adjustment & Allocation  │  Analysis (LTP vs Rolling)  │  Template DL   │
│  Admin: Hierarchy, Origin, Allocation  │  Connector                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ REST API
┌────────────────────────────────▼────────────────────────────────────────┐
│                         Backend (Node.js)                                │
├─────────────────────────────────────────────────────────────────────────┤
│  Auth  │  Org/User  │  Dimension/Hierarchy  │  Forecast  │  Allocation   │
│  Freeze  │  Analysis  │  Template Gen  │  Connector                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Prisma
┌────────────────────────────────▼────────────────────────────────────────┐
│                         PostgreSQL                                       │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │  ERP System     │
                        └─────────────────┘
```

---

## 6. Resolved Decisions

1. **Organization hierarchy** — **Group → BU → Company → Plant**. Long-term planning is **BU**-scoped; rolling is Company/Plant/Sales. Sales companies have no plant.
2. **Sales** — Person or team/group.
3. **Channel** — Configurable hierarchy (e.g., All → Region → Agent → Country → Customer).
4. **Product attributes** — Configurable; can form a hierarchy.
5. **Forecast** — Product × Channel × Period. Long-term vs rolling type.
6. **Version (time)** — **LTP:** `LTP-2026Q1-A` (year+quarter+sequence). **Rolling:** `RFC-202603-A` (year+month+sequence).
7. **Version × Origin** — **Both LTP and rolling:** multiple origins; each has status (draft/submitted); only one origin **activated**; manager adjustment supported for both.
8. **Forecasting origin** — Configurable (marketing, sales, planner, manager adjustment, finance target).
9. **Template generation** — From product/channel/origin config.
10. **Adjustment** — Manager chooses axis (by channel or by product), selects level + value on scope dimension, enters quantity; allocation % on chosen dimension breaks down to children. Allocation % per dimension (channel OR product).
11. **Analysis** — Compare long-term plan vs rolling production.
12. **Period config by forecast type** — Length and frequency defined per type. Forecasting horizontal N is **admin-configurable**.
13. **Zero vs. not updated** — NULL = not entered/forgot; 0 = explicit zero. Config: how to treat null (warning/zero), highlight not-updated cells.
14. **Product unit** — Configurable per product. First-time upload can update config. Conflict (same product, different units) → error. UI to correct unit if first upload was wrong.
15. **Price/currency** — Optional reference fields. If uploaded, used for analysis only (value = quantity × price). Core forecast is quantity-based.

---

## 7. Items to Confirm (Pending)

*Answers to be filled in later. These choices affect implementation details.*

### A. Long-term Plan Scope & Ownership
| # | Question | Answer |
|---|----------|--------|
| 1 | Who owns long-term plans? (Central team? Specific role? Per company?) | **Org: Group → BU → Company → Plant.** Long-term planning is carried by **BU**. |
| 2 | Version naming for long-term plan? (e.g. LTP-2026, LTP-2026-Q2?) | **LTP:** `LTP-2026Q1-A`. **Rolling:** `RFC-202603-A`. |
| 3 | Does long-term plan also have multiple origins (marketing, finance, etc.) or single? | **Yes.** Long-term has multiple origins and can be adjusted by managers (same as rolling). |

### B. Permissions & Access Control
| # | Question | Answer (later) |
|---|----------|----------------|
| 4 | Role permissions: Can forecaster from Sales A see Sales B’s forecast? Who can activate VersionOrigin? Who defines allocation? Who triggers ERP sync? | Yes: roles are defined in the app; users are assigned to roles. Role definitions grant permissions for displaying/updating forecasting data by org and VersionOrigin, activating VersionOrigin, defining allocation rules, and triggering ERP sync. Only admin can create/modify roles and permissions. **First admin:** created via **bootstrap script**. |
| 5 | Cross-company: Can a user in multiple companies see consolidated across companies or always one company at a time? | If a user has permission to display forecasting data for certain companies, they can view consolidated data for those permitted companies in the app (consolidation is restricted by the same company visibility scope). |

### C. Dimension & Hierarchy
| # | Question | Answer (later) |
|---|----------|----------------|
| 6 | Product/channel hierarchy: shared globally (companyId null) or per-company? | Shared globally. We can define multiple hierarchies, and forecasting templates select which hierarchy is used for a given upload/entry. |
| 7 | Forecasting level: data entry at any hierarchy level or leaf nodes only? | Data entry levels/leaf nodes are controlled by the selected **upload template** (the template determines which hierarchy levels/nodes are used for forecasting numbers). |
| 8 | Sales ↔ Channel: Is each Sales person/team assigned to specific channel nodes (e.g. Sales A = APAC)? | No. Sales person/team does not need assignment to specific channel nodes. |

### D. Period & Analysis
| # | Question | Answer (later) |
|---|----------|----------------|
| 9 | Period alignment for analysis: long-term (quarters) vs rolling (weeks). Sum weeks to quarters? Common granularity? | Analysis UI should be pivot-table-like: user selects analysis dimensions for X/Y axes and chooses key figures with calculation method (sum/max/min/average). Period alignment rules will be applied as part of the underlying data model. |
| 10 | Rolling period window: always from “current period” + N periods, or configurable start? | Define a **configurable** forecasting horizontal (e.g., N or N+1). For `RFC-202603-A`, period window = `202603` through `202603 + N`. N is admin-configurable. |

### E. Adjustment Logic
| # | Question | Answer (later) |
|---|----------|----------------|
| 11 | Adjustment direction: top-down only, or also bottom-up (edit child → parent updates)? | Adjustment can be entered at any hierarchy level; however, when allocating/distributing to children we must follow a **top-down approach** and we need allocation rules to exist along the parent → child path (otherwise allocation/distribution is not possible). |
| 12 | Allocation %: must children sum to 100%? What if not? | **Case 1:** Fixed rates sum to &lt;100% (e.g. 80%). Adjustment = +100 pc. Allocate 80 pc to fixed-rate nodes first. Remaining 20 pc goes to nodes **without** fixed rate, using **proportion of original forecast** among those nodes. Example: X (80 pc), Y (20 pc) → X 80%, Y 20% → X gets 16 pc, Y gets 4 pc. **Case 2:** If there is **no free node** (no child without a fixed allocation %) to absorb the remainder, run a **second allocation pass**: distribute the remaining quantity using **each node’s proportion of original forecast across all nodes** at that level. Example: A (fixed 50%), B (30%), C (10%) — sum 90%, remainder 10 pc. Original forecast: A=100, B=50, C=50. Second pass: A 50%, B 25%, C 25% → A +5, B +2.5, C +2.5. Final: A=55, B=32.5, C=12.5. **Mark** when second-run allocation occurs (e.g. `allocationRun: 2` in AdjustmentLog) for traceability. |
| 13 | Combined product × channel allocation: different allocation by (product + channel) or one dimension at a time? | Manager **chooses** which dimension drives the adjustment: **by channel** or **by product**. **By channel:** select product level + value (scope), then adjustment quantity; allocation % distributes across **channel** children. **By product:** select channel level + value (scope), then adjustment quantity; allocation % distributes across **product** children. One dimension is the allocation axis; the other defines the scope (level + value). Allocation rules remain per dimension (channel OR product), not combined. |

### F. Units & Value
| # | Question | Answer (later) |
|---|----------|----------------|
| 14 | Unit of measure: one unit (e.g. pieces) or configurable per product (pieces, boxes, kg)? | Product unit is **configurable** per product (stored in product/dimension config). **First-time upload:** unit from upload can update the config. **Conflict:** if same product has different units in same file or in later files (different version/origin) → show error. **Correction:** UI to change product unit setting if first upload was wrong. |
| 15 | Value: quantity only, or also revenue/value (quantity × price)? | Price and currency are **optional reference fields**. If user uploads file with price/currency, store them for **analysis only** (value = quantity × price). Core forecast remains quantity-based; value is derived for analysis when price is available. |

---

## 8. Development Phases & Tasks

### Phase 0 — Foundation (≈ 1–2 weeks)

| # | Task | Details |
|---|------|---------|
| 0.1 | Project structure | Monorepo: `frontend/`, `backend/`; `package.json` for each |
| 0.2 | Database | PostgreSQL + Prisma init; `.env` for `DATABASE_URL` |
| 0.3 | Backend API | Node.js (Express/Fastify); health check, CORS |
| 0.4 | Frontend app | React (Vite/CRA); routing, basic layout |
| 0.5 | Auth | JWT or session; login/logout; protect routes |
| 0.6 | Bootstrap script | CLI/script to create first admin user |
| 0.7 | MessageContext | Frontend: custom alerts/confirms (no `alert`/`confirm`) |
| 0.8 | Design system | CSS vars (#f5f5f7, #1d1d1f); Lucide icons 16px |

**Deliverable:** App runs; user can log in; bootstrap creates admin.

---

### Phase 1 — Organizations, Roles & Users (≈ 2–3 weeks)

| # | Task | Details |
|---|------|---------|
| 1.1 | Prisma: Group, BU, Company, Plant | Schema; migrations |
| 1.2 | Prisma: User, OrgMembership | User ↔ Group/BU/Company/Plant (many-to-many) |
| 1.3 | Prisma: Sales | `companyId`, `plantId?`; link to Company/Plant |
| 1.4 | Roles & permissions model | `Role`, `Permission`, `UserRole`; permissions: display/update by org & VersionOrigin, activate, allocation, ERP sync |
| 1.5 | CRUD APIs | Group, BU, Company, Plant, Sales; list with hierarchy |
| 1.6 | User management API | Create/update users; assign to orgs and roles |
| 1.7 | Permission middleware | Check permissions on API calls (org scope, action) |
| 1.8 | Admin UI: org hierarchy | Create/edit Group → BU → Company → Plant |
| 1.9 | Admin UI: Sales | CRUD sales (person/team) under Company/Plant |
| 1.10 | Admin UI: users & roles | User list; assign orgs, assign roles; role CRUD (admin only) |

**Deliverable:** Admin can set up orgs, sales, users, roles; permissions enforced.

---

### Phase 2 — Product & Channel Hierarchies (≈ 2–3 weeks)

| # | Task | Details |
|---|------|---------|
| 2.1 | Prisma: Dimension, DimensionLevel, DimensionNode | Schema; support multiple hierarchies; `unitOfMeasure?` on node |
| 2.2 | Hierarchy APIs | CRUD dimension/level/node; tree structure; validation |
| 2.3 | Admin UI: product hierarchy | Define levels (Brand → Model → Size, etc.); add nodes; set unit |
| 2.4 | Admin UI: channel hierarchy | Define levels (All → Region → Agent → Country, etc.); add nodes |
| 2.5 | Support multiple hierarchies | Dimension has name/code; admin can create several product/channel hierarchies |

**Deliverable:** Admin can define multiple product and channel hierarchies globally.

---

### Phase 2b — Forecast Config (≈ 1–2 weeks)

| # | Task | Details |
|---|------|---------|
| 2b.1 | Prisma: ForecastOrigin | Configurable; e.g. marketing, sales, planner, manager |
| 2b.2 | Prisma: PeriodConfig | Per forecast type (LTP/rolling); unit, length N, format, mandatory count |
| 2b.3 | Prisma: ZeroVsNotUpdatedConfig | treatNullAs, highlightNotUpdated, mandatoryPeriodValidation |
| 2b.4 | Config APIs | CRUD for ForecastOrigin, PeriodConfig, ZeroVsNotUpdatedConfig |
| 2b.5 | Admin UI: origins, period, zero config | Forms for each; link to forecast type where needed |

**Deliverable:** ForecastOrigin, PeriodConfig, ZeroConfig defined before forecast creation.

---

### Phase 3 — Forecast Core & Grid (≈ 3–4 weeks)

| # | Task | Details |
|---|------|---------|
| 3.1 | Prisma: Forecast, Version, VersionOrigin, ForecastData | Schema; versionCode (LTP/RFC); quantity nullable; price?, currency? |
| 3.2 | Version APIs | Create Version (LTP/RFC); list by scope (BU/Company/Plant) |
| 3.3 | VersionOrigin APIs | Create/list VersionOrigin; status draft/submitted; activate one per version |
| 3.4 | ForecastData APIs | CRUD by productNode×channelNode×periodKey; bulk upsert |
| 3.5 | Consolidation logic | Sum ForecastData across sales for Company/Plant (rolling) |
| 3.6 | Grid UI: per-sales (rolling) | Select Sales → Version → Origin; editable grid |
| 3.7 | Grid UI: consolidated (rolling) | Select Company/Plant → Version; read-only aggregated grid |
| 3.8 | Grid UI: long-term (BU) | Select BU → Version → Origin; editable grid |
| 3.9 | Permission checks | Filter data by user’s org/role permissions |
| 3.10 | Zero vs not-updated | Highlight NULL cells; apply ZeroVsNotUpdatedConfig in UI |

**Deliverable:** Users can create versions, enter forecast data, view per-sales/consolidated/LTP grids.

---

### Phase 3b — Template & Upload (≈ 2 weeks)

| # | Task | Details |
|---|------|---------|
| 3b.1 | Template generation API | Input: Version, Origin, hierarchy selection → Excel/CSV with columns (product, channel, periods, quantity, unit?, price?, currency?) |
| 3b.2 | Template download UI | Select Version, Origin, hierarchy; download file |
| 3b.3 | Upload API | Parse Excel/CSV; validate (product/channel/period exist); product unit: first-time update config, conflict detection |
| 3b.4 | Upload validation | Row-level errors; option: partial import vs reject all |
| 3b.5 | Upload UI | Select file → upload → show validation report; confirm import |
| 3b.6 | Product unit correction UI | Admin: change unit for product node when first upload was wrong |

**Deliverable:** Users can download template, fill, upload; product unit handled; conflicts blocked.

---

### Phase 4 — Adjustment & Allocation (≈ 2–3 weeks)

| # | Task | Details |
|---|------|---------|
| 4.1 | Prisma: AllocationRule | dimensionId, levelId, parentNodeId, childNodeId, allocationPercentage, versionOriginId? |
| 4.2 | Prisma: AdjustmentLog | versionOriginId, productNodeId?, channelNodeId?, periodKey, oldQty, newQty, allocationRun? |
| 4.3 | Allocation rule APIs | CRUD; scoped to all or VersionOrigin |
| 4.4 | Admin UI: allocation rules | Define % at product/channel levels; per VersionOrigin or global |
| 4.5 | Adjustment API | Input: axis (channel/product), scope (level+value), quantity; apply allocation (Case 1 & 2); write AdjustmentLog with allocationRun |
| 4.6 | Manager adjustment UI | Choose axis → select scope → enter quantity → apply; show result |
| 4.7 | Breakdown logic | Top-down; Case 1 (free nodes by proportion); Case 2 (no free nodes, second pass); mark allocationRun: 2 |

**Deliverable:** Manager can adjust at any level; allocation % distributes; second-run marked.

---

### Phase 5 — Freeze Time Frame (≈ 1 week)

| # | Task | Details |
|---|------|---------|
| 5.1 | Prisma: FreezeRule | companyId/plantId, startPeriod, endPeriod, description |
| 5.2 | Freeze APIs | CRUD FreezeRule |
| 5.3 | Backend: block edits | If period in freeze and user lacks `allowFrozenEdit` → reject |
| 5.4 | Admin UI: freeze windows | Define freeze by period range |
| 5.5 | Admin toggle | `allowFrozenEdit` for admin users; UI switch |

**Deliverable:** Freeze windows block edits unless admin override.

---

### Phase 6 — Analysis (≈ 2 weeks)

| # | Task | Details |
|---|------|---------|
| 6.1 | Analysis API | Input: dimensions for X/Y, key figure (quantity/value), calc (sum/max/min/avg); filters (LTP vs rolling, version, etc.) |
| 6.2 | Period alignment | Map rolling (weeks) to LTP (quarters) when comparing |
| 6.3 | Value derivation | When price/currency present: value = quantity × price |
| 6.4 | Pivot-like UI | Select X axis dimension, Y axis dimension; key figure + calc; render table |
| 6.5 | Compare LTP vs rolling | Side-by-side or diff view by product × channel × period |
| 6.6 | Export | Export analysis result as Excel/CSV |

**Deliverable:** Pivot-style analysis; compare LTP vs rolling; export.

---

### Phase 7 — ERP Connectors & Sync (≈ 2 weeks)

| # | Task | Details |
|---|------|---------|
| 7.1 | Prisma: Connector, ConnectorFieldMapping | baseUrl, method, authType, headers, payloadTemplate; field mappings |
| 7.2 | Connector APIs | CRUD; test connection |
| 7.3 | Admin UI: connector | Register API; configure auth; define payload template and field mappings |
| 7.4 | Sync API | Manual trigger; read consolidated rolling + activated VersionOrigin; build payload; call external API |
| 7.5 | Sync history | Log sync runs; status; error message |
| 7.6 | Sync UI | Button to trigger; show history and status |

**Deliverable:** Admin configures ERP connector; user triggers sync; history visible.

---

### Phase 8 — Polish & Operations (≈ 2–3 weeks)

| # | Task | Details |
|---|------|---------|
| 8.1 | Copy/clone version | Clone Version or VersionOrigin as starting point for new version |
| 8.2 | Carry-forward | New rolling version: optional auto-fill from previous activated origin, shifted by 1 period |
| 8.3 | Audit trail | Log: who uploaded, changed status, activated, triggered sync |
| 8.4 | Notifications | Configurable triggers: version created, origin submitted/activated, freeze approaching, sync done/failed |
| 8.5 | Dashboard | Landing: versions in progress; submission status per origin; not-updated count; upcoming freezes |
| 8.6 | Export forecast grid | Export grid with filters as Excel/CSV |
| 8.7 | Performance | Pagination, lazy load, server-side aggregation for large grids |
| 8.8 | Design notes | Optional approval workflow; concurrent-edit handling; hierarchy soft-delete; allocation % validation |

**Deliverable:** Clone, carry-forward, audit, notifications, dashboard, export; performance tuned.

---

### Phase Dependency Diagram

```
Phase 0 (Foundation)
    ↓
Phase 1 (Orgs, Roles, Users) ←── Bootstrap creates first admin
    ↓
Phase 2 (Dimensions) + Phase 2b (Config)
    ↓
Phase 3 (Forecast Core) + Phase 3b (Template & Upload)
    ↓
Phase 4 (Adjustment & Allocation)
    ↓
Phase 5 (Freeze)
    ↓
Phase 6 (Analysis)
    ↓
Phase 7 (ERP Sync)
    ↓
Phase 8 (Polish)
```

---

### Recommended Implementation Order (Summary)

1. **Phase 0** — Foundation
2. **Phase 1** — Orgs, roles, users (permissions before forecast)
3. **Phase 2 + 2b** — Dimensions + forecast config
4. **Phase 3 + 3b** — Forecast core + template/upload (first usable forecast workflow)
5. **Phase 4** — Adjustment & allocation
6. **Phase 5** — Freeze
7. **Phase 6** — Analysis
8. **Phase 7** — ERP sync
9. **Phase 8** — Polish
