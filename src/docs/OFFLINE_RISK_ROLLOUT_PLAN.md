# Offline Risk Monitoring System — Phased Rollout & Validation Plan

**Date:** 2026-03-26  
**Owner:** Operations / Product  
**Status:** Ready for Phase 0 Kickoff

---

## 1. PHASED ROLLOUT PLAN

### **Phase 0: Internal Validation (Weeks 1–2)**

**Objective:** Test noise levels, threshold calibration, digest rhythm, and SuperAdmin workflow before exposing to restaurants.

**Access:**
- SuperAdmin only (2–3 internal staff)
- Read-only view of test/staging restaurants
- All analytics enabled (digest, snapshots, trends, operator outliers, temporal)

**Features Enabled:**
- OfflineRiskControlCenter (full SuperAdmin view)
- Digest generation (every 6 hours, not daily)
- Snapshot history + acknowledgement
- All card types: Critical Alert, Unresolved Backlog, Top Risk Stores, Operator Outliers, Escalation Trend, Freshness Indicator
- Manual and auto-refresh

**Activities:**
1. Run 5–10 test offline order scenarios per day
2. Document digest output (noise, clarity, missing signals)
3. Review escalation and flagged-rate calculations (check for drift)
4. Test snapshot dedup and acknowledgement workflow
5. Verify scope isolation (confirm no cross-restaurant data leak)
6. Time digest generation (target <5s end-to-end)
7. Load test with 100+ pending flagged orders

**Success Criteria:**
- ✅ Digest generation <5 seconds, no errors
- ✅ Snapshot acknowledgement works reliably
- ✅ SuperAdmin can identify 3+ actionable signals per digest
- ✅ No obvious false positives (>80% of flagged items warrant review)
- ✅ Operator outlier detection working (identifies real problem staff)
- ✅ Freshness indicator accurate (live vs snapshot labels correct)
- ✅ No data leakage between test restaurants

**Exit Criteria for Phase 1:**
- All 7 success criteria met
- No critical bugs in core calculations
- SuperAdmin team confident thresholds are reasonable
- Digest readability acceptable (not wall-of-text)

---

### **Phase 1: Pilot with Volunteer Restaurants (Weeks 3–6)**

**Objective:** Test real-world adoption, workflow integration, and trust signals with 2–3 restaurants that actively participate in daily review.

**Access:**
- 2–3 volunteer restaurants (high-trust, willing to provide feedback)
- Restaurant managers + SuperAdmin oversight
- All analytics enabled

**Features Enabled:**
- RestaurantOfflineRiskOverview (restaurant-scoped local view)
- Critical alerts, local operator outliers, escalation trends, unresolved backlog
- Manual daily refresh option
- Digest acknowledgement + action tracking
- Link to offline review workflow (flag resolution)

**Activities:**
1. **Daily routine:** Manager checks local overview at 09:00 & 17:00 (London time)
2. **Weekly sync:** 15-min call with pilot restaurants to discuss findings + false positives
3. **SuperAdmin review:** 3x per week check pilot digest for anomalies
4. **Feedback collection:** Slack channel for real-time noise complaints
5. **Data logging:** Timestamp each manager login, action taken, time-to-action on flagged orders
6. **Threshold tuning:** Weekly review of top false-positive reason codes

**Measurement:** (See Section 2: Validation Metrics)

**Success Criteria:**
- ✅ Managers log in ≥4x per week (weekly adoption rate ≥80%)
- ✅ Digest acknowledgement rate ≥70% within 24 hours
- ✅ False-positive rate ≤15% (operator outlier, escalation flags)
- ✅ Flagged order resolution time: median ≤8 hours
- ✅ Manager trust score ≥7/10 (survey question: "Do you trust these signals?")
- ✅ No scope/access leaks detected
- ✅ Digest noise acceptable (managers don't report "too many false alerts")
- ✅ Escalation detection working (captures real problem orders)

**Exit Criteria for Phase 2:**
- All 8 success criteria met
- No major usability complaints
- Thresholds stable (no oscillation week-to-week)
- Zero security/scope incidents
- Operator outlier detection validated by managers ("yes, that person has issues")

---

### **Phase 2: Regional Expansion (Weeks 7–12)**

**Objective:** Scale pilot learnings to 5–10 stores in same region; validate theme consistency and regional tuning needs.

**Access:**
- 5–10 restaurants in London region
- Regional manager oversight + SuperAdmin coordination
- Same features as Phase 1

**Activities:**
1. **Onboarding calls:** 30-min per restaurant (walk through local view, expected alerts)
2. **Daily manager reviews:** Target ≥4x per week per store
3. **Regional weekly sync:** 30-min call with regional manager + store leads
4. **Escalation chain:** Regional manager reviews CRITICAL alerts within 2 hours
5. **Threshold adjustment:** Weekly review; adjust if >20% false-positive rate in region
6. **Comparative analysis:** Which stores have different outlier patterns? Why?
7. **Adoption tracking:** Login frequency, time-to-action by store

**Measurement:** (See Section 2: Validation Metrics)

**Success Criteria:**
- ✅ 8 of 10 stores ≥80% weekly adoption
- ✅ Average digest acknowledgement rate ≥75%
- ✅ False-positive rate ≤15% across region
- ✅ Escalation resolution: 90% resolved within 24 hours
- ✅ Manager net promoter score (question: "Would you recommend this to other managers?") ≥6/10
- ✅ Zero access incidents
- ✅ No threshold tuning ping-ponging (stable week-to-week)
- ✅ Operator outliers validated by regional manager (≥70% identified as real issues)

**Exit Criteria for Phase 3:**
- All 8 success criteria met
- Adoption sustainable (not declining over 4 weeks)
- No new platform bugs discovered
- Regional manager confident in escalation routine

---

### **Phase 3: Full Portfolio Rollout (Week 13+)**

**Objective:** Deploy to all restaurants with structured monitoring and continuous optimization.

**Access:**
- All restaurants with manager + SuperAdmin access
- Phased by region based on Phase 2 readiness

**Activities:**
1. **SuperAdmin daily:** Review portfolio digest (09:00 & 17:00 UTC+0)
2. **Manager daily:** Review local overview (≥2x per day)
3. **Weekly optimization:** Monitor false-positive trends, adjust thresholds
4. **Quarterly review:** Full audit of adoption, threshold drift, trust metrics

**Success Criteria:** (Ongoing monitoring; see Section 5: Exit Criteria)

---

## 2. VALIDATION METRICS

Track these 8 metrics throughout rollout. **Not a massive scorecard — just the signals that matter.**

| Metric | Phase | Target | How to Measure | Why It Matters |
|--------|-------|--------|---|---|
| **Weekly Adoption Rate** | 1+ | ≥80% | Count manager logins / expected logins per store | If managers don't check, signals go unactionable |
| **Digest Acknowledgement Rate** | 1+ | ≥70% within 24h | Timestamp digest sent, user acknowledged | System usefulness signal; high ack = trust |
| **False-Positive Rate** | 1+ | ≤15% | (Flagged orders marked "innocent" by manager) / total flagged | Noise kills trust; >20% = system tune needed |
| **Flagged Order Resolution Time** | 1+ | Median ≤8h | Time from order flagged to review_status=resolved | Operationally important; backlog SLA |
| **Manager Trust Score** | 1+ | ≥7/10 | Weekly 1-q survey: "Do you trust these signals?" | Adoption driver; <6 = tuning needed |
| **Escalation Detection Accuracy** | 1+ | ≥70% validation | Managers confirm "yes, this was actually a problem" | Core value — must catch real issues |
| **Scope/Access Incidents** | 0+ | 0 | Audit logs: did user view unauthorized data? | Critical safety metric; any breach = rollback |
| **Unreviewed Backlog Growth** | 1+ | Stable or shrinking | Count flagged orders awaiting review at end of week | If queue grows, system becomes blame tool |

---

## 3. OPERATIONAL PLAYBOOKS

### **SuperAdmin Daily Review (15 min)**

**Time: 09:00 & 17:00 UTC+0**

1. **Open OfflineRiskControlCenter**
   - Check "Latest Digest Snapshot" — when was it last generated?
   - If >4h old, manually refresh
2. **Scan Critical Alert**
   - Are there overdue flagged orders? If yes:
     - Note count + oldest timestamp
     - Check top 2 restaurant names
     - Send Slack: "@regional_manager: X overdue at {store}, oldest Y minutes"
   - Are there abuse escalations? If yes:
     - Note count + top restaurant
     - Flag for next regional manager call
3. **Check Escalation Trend**
   - Is 24h escalation rate >7d average? If yes by >10pts:
     - Note the delta
     - Check if specific restaurants driving spike
     - Add to weekly trend summary
4. **Review Top Risk Stores**
   - Is same store in top 5 for 2+ consecutive digests?
     - If yes, schedule manager call (not urgent, within 2 days)
     - Ask: "What's going on? Need support?"
   - If new store in top 5:
     - Check recent order volume (is it abnormal?)
     - Coordinate with regional manager
5. **Operator Outliers**
   - Are outliers consistent week-to-week?
     - If yes, note for regional manager (training/coaching opportunity)
     - If changing wildly, likely noise — ignore
6. **Freshness Check**
   - Is snapshot <4h old? If not, log why (system delay? no orders?)
   - If consistently stale, escalate to platform team

**Decision Tree (Stop if any):**
- Overdue order >6h old? → Call store manager NOW
- CRITICAL alert fired twice in one day? → Emergency regional manager call
- Abuse escalation count >5? → Escalate to compliance

---

### **Restaurant Manager Daily Review (10 min)**

**Time: 09:30 & 17:30 (store local time)**

1. **Open RestaurantOfflineRiskOverview**
   - Check "Latest Digest Snapshot" timestamp
   - If >6h old, click refresh manually
2. **Scan Critical Alert**
   - Count of overdue orders?
   - If >0, check top reason code (e.g., "discount capped")
   - Jump to offline review queue → action oldest 2 items
3. **Review Local Operator Outliers**
   - Any names you recognize as "problem staff"?
     - If yes, this is validation — system working
     - If no, likely noise — ignore for this cycle
   - Are the same people in outliers every day?
     - If yes, schedule 1-on-1 coaching conversation this week
4. **Check Escalation Trend**
   - Is 24h escalation >7d average? If yes:
     - Ask: "Did something specific happen?"
     - Check for unusual order patterns (rush, new POS operator, etc.)
5. **Unresolved Backlog**
   - Count of orders awaiting manager review?
   - If >5, commit to 30 min review today
6. **Action on Flags**
   - Jump to offline review workflow
   - Resolve 1–2 oldest flagged items (takes 2–3 min each)
   - Mark as "acceptable," "price adjusted," "operator trained," or "escalate"

**Decision Tree (Act if any):**
- Unresolved backlog >10? → Block 1 hour this week to clear
- Same operator in outliers 3+ days in a row? → 1-on-1 scheduled this week
- Escalation rate >80%? → Call SuperAdmin (something abnormal happening)

---

### **When a Store is CRITICAL (SuperAdmin Escalation)**

**Definition:** Any 2 of: (1) overdue order >6h old, (2) CRITICAL alert fired twice in 24h, (3) escalation rate >80%, (4) abuse escalation count >5

**Immediate Response (0–30 min):**
1. Call regional manager + store manager (3-way)
2. Ask: "What happened? Any system issues, staffing changes, or order surge?"
3. Check real-time order queue (not just offline reviews)
4. Determine: Is this a real operational crisis, or system noise?

**If Real Crisis (e.g., POS down, skeleton crew):**
- SuperAdmin documents situation in Slack
- Offers: "Do you need help? Can we reduce order intake temporarily?"
- Follow up daily until resolved

**If Likely Noise (e.g., threshold too sensitive):**
- Ask manager: "Are these orders actually problematic?"
- If >50% marked innocent, flag threshold for tuning
- Note in weekly threshold review

**Resolution:**
- Mark incident in dashboard (for audit trail)
- SuperAdmin sends summary to regional manager within 2 hours

---

### **When Digest Shows Worsening Trend**

**Definition:** Escalation rate up >15 points week-to-week, OR flagged rate up >10 points, OR new top-5 risk restaurant

**Response (within 24 hours):**

1. **Diagnose (10 min)**
   - Is this store-wide or operator-specific?
   - Is it sudden (bad event) or gradual (systemic)?
   - Is it a real change or threshold artifact?

2. **Call Regional Manager (15 min)**
   - Share metric + trend chart
   - Ask: "Is there context we're missing?"
   - Possible answers:
     - "New cashier started" → Training opportunity
     - "Promo caused volume spike" → Normal, monitor
     - "POS upgrade last week" → System learning period
     - "No idea" → Dig deeper; likely noise

3. **Action (by end of week)**
   - If training needed: Regional manager schedules coaching
   - If volume-related: SuperAdmin notes for future context
   - If systemic: Add to weekly threshold review (may need tuning)

4. **Follow-up (next digest)**
   - Is trend reversing? If yes, document outcome
   - Is trend stable? If yes, accept as new baseline
   - Is trend accelerating? If yes, escalate to CRITICAL

---

### **When Operator Outliers Appear**

**Definition:** Staff member flagged as statistical outlier (40%+ flagged rate, 2+ standard deviations above peer average)

**Response (by end of next business day):**

1. **Manager Validation (2 min)**
   - Do you recognize this person as having issues? (1-question survey to manager)
   - If "yes" → System working, move to coaching
   - If "no" → Likely noise, monitor but don't act

2. **If Validated (coaching conversation, 20 min)**
   - Manager schedules 1-on-1 with operator
   - Focus: "I notice X orders had issues. What's going on? Training help?"
   - Frame as supportive, not punitive
   - Document: Date, outcome, agreed improvements

3. **If Not Validated (monitor)**
   - Add to "watch list" — if outlier persists 3+ days, investigate
   - Possible explanations:
     - New role (learning curve)
     - Unusual order types that day
     - POS glitch (not operator fault)

4. **Follow-up (next week)**
   - Is operator still in outliers?
     - If no → Coaching worked, close case
     - If yes → Escalate (deeper issue, may need reassignment)

---

## 4. PILOT REVIEW CHECKLIST (Phase 1 Exit)

**Complete this audit before moving to Phase 2.**

### **Operational Health**

- [ ] No data scope leaks detected (audit logs clean)
- [ ] Digest generation runs reliably (<5 sec, >99% success)
- [ ] Snapshot dedup working (no duplicate IDs)
- [ ] Acknowledgement workflow captures all actions
- [ ] Manual refresh responsive (<2 sec)
- [ ] Cross-store data isolation enforced (tested with 2 stores viewing same order)

### **Adoption & Trust**

- [ ] 2 of 3 pilot stores ≥80% weekly adoption rate
- [ ] Average manager login frequency: 4–5x per week
- [ ] Digest acknowledgement rate ≥70% within 24h
- [ ] Manager trust survey ≥7/10 (≥2 of 3 stores)
- [ ] Zero "stop sending me alerts" requests
- [ ] Managers can articulate 2+ ways system helps them

### **Signal Quality**

- [ ] False-positive rate ≤15% (managers validating <15% of flags as "innocent")
- [ ] Escalation detection working (≥70% of flagged orders managers agree needed review)
- [ ] Operator outlier detection ≥70% validated by managers as real issues
- [ ] Overdue detection accurate (no false timestamps)
- [ ] Escalation trend direction correct (up when problems increase, down when improving)

### **Threshold Tuning**

- [ ] No oscillation (thresholds not flip-flopping week-to-week)
- [ ] No restaurant-specific outliers (all 3 stores similar noise/signal ratio)
- [ ] Reason code distribution reasonable (no single code >40% of flagged orders)
- [ ] Operator outlier threshold not too sensitive (≥70% validation)
- [ ] Overdue window (240 min) reasonable (matches real SLA expectations)

### **Workflow Integration**

- [ ] Offline review workflow integration smooth (navigate from digest → review without friction)
- [ ] Managers know how to mark order as "resolved" + reason code
- [ ] Escalation routing clear (escalated → regional manager → SuperAdmin)
- [ ] Acknowledgement actions tracked (decision log shows manager intent)

### **SuperAdmin Operations**

- [ ] SuperAdmin can run daily 15-min review without blocking on data issues
- [ ] Critical alert escalation routine works (manager called within 30 min)
- [ ] Threshold tuning process documented + executable
- [ ] Weekly trend summary can be written in <20 min

### **Risk Mitigation**

- [ ] Zero security/scope incidents
- [ ] No pervasive false positives causing "alert fatigue"
- [ ] Backlog not growing (weekly flagged orders ≤ weekly resolved)
- [ ] No complaints about unfair blame/targeting

**Checklist Result:**
- **✅ All checked?** → Ready for Phase 2
- **❌ >2 items unchecked?** → Extend Phase 1 by 2 weeks, address gaps

---

## 5. EXIT CRITERIA FOR BROADER ROLLOUT (Phase 3)

**Before expanding to full portfolio, all of these must be true.**

### **Adoption Sustainability**
- ✅ Weekly adoption rate ≥80% across pilot + Phase 2 stores (no decline over 3+ weeks)
- ✅ Average manager daily logins ≥1.5 (not just weekly)
- ✅ Digest acknowledgement rate stable ≥70% for 3+ consecutive weeks

### **Signal Accuracy**
- ✅ False-positive rate ≤15% and stable (not creeping up)
- ✅ Escalation detection ≥70% validated by managers as accurate
- ✅ Operator outliers ≥70% validated by managers as real issues
- ✅ No systemic false positives in specific reason codes (e.g., "coupon rejected" not >30% of flagged)

### **Operational Maturity**
- ✅ Flagged order resolution time: 90th percentile ≤12 hours (median ≤8h)
- ✅ Unreviewed backlog stable or shrinking (not growing week-to-week)
- ✅ Escalation resolution (CRITICAL alert → action) <2 hours average
- ✅ No threshold oscillation (same thresholds used for 4+ consecutive weeks without change)

### **Trust & Confidence**
- ✅ Manager trust score ≥7/10 across 80%+ of pilot/Phase 2 stores
- ✅ Net promoter question ("Would recommend?") ≥6/10 average
- ✅ Zero "system is unfair / blaming" complaints
- ✅ Operator outlier feedback: managers acknowledge coaching led to improvement

### **Safety & Compliance**
- ✅ Zero data scope/access incidents across all rollout phases
- ✅ Audit log complete + reviewable (no missing events)
- ✅ Role-based access enforced (managers see only their restaurant, SuperAdmin sees portfolio)
- ✅ Performance stable (digest generation <5 sec, no production outages)

### **Platform Readiness**
- ✅ All known bugs fixed (no open critical/high issues)
- ✅ Capacity verified (system supports 3x current load without degradation)
- ✅ Documentation complete (manager guide, SuperAdmin runbook, troubleshooting)
- ✅ Support process defined (who handles escalations, bug reports, threshold tuning requests)

**Exit Checklist:**
- [ ] Adoption criteria met
- [ ] Signal accuracy criteria met
- [ ] Operational maturity criteria met
- [ ] Trust & confidence criteria met
- [ ] Safety & compliance criteria met
- [ ] Platform readiness criteria met

**If any category ≤80% complete:** → Extend current phase by 2 weeks, address gaps, re-assess

---

## 6. MONITORING & TUNING DURING ROLLOUT

### **Weekly Threshold Review (15 min, Tuesdays 10:00 UTC+0)**

**Participants:** SuperAdmin lead + 1 restaurant manager from pilot

1. **Calculate metrics from past week:**
   - False-positive rate (by reason code)
   - Escalation rate by store
   - Flagged rate by store
   - Operator outlier validation rate

2. **Ask: Do thresholds need adjustment?**
   - If false-positive rate >20%: increase threshold (fewer alerts)
   - If escalation detection missing real issues: decrease threshold (more alerts)
   - If operator outlier validation <60%: relax threshold
   - If threshold oscillated: freeze for 2 more weeks

3. **Document:**
   - Current thresholds
   - Change (if any) + reason
   - Expected impact (e.g., "Will reduce flagged orders by ~20%")
   - Recheck date (when will we evaluate impact?)

### **Weekly Trend Summary (20 min, Tuesdays 10:30 UTC+0)**

**Output:** Slack message summarizing pilot week

```
**Offline Risk Rollout — Week X Summary**

Adoption: 82% avg weekly rate (target ≥80%) ✅
False Positives: 12% (target ≤15%) ✅
Resolution Time: median 7h (target ≤8h) ✅
Trust Score: 7.2/10 (target ≥7) ✅

Highlights:
- Store A escalation down 15% — coaching with operator X working
- Store B unresolved backlog cleared (was 12, now 3)
- 3 false positives flagged in "coupon_rejected" — tuning review scheduled

Watch:
- Store C new top-5 risk → regional manager call scheduled
- Operator Y consistently in outliers → recheck if real or noise

Threshold Changes: None this week

Next: Recheck Week X+1
```

---

## 7. TIMELINE & RESPONSIBILITIES

| Phase | Weeks | Lead | Participants | Key Deliverable |
|-------|-------|------|---|---|
| **Phase 0** | 1–2 | SuperAdmin | Platform team | Phase 1 exit checklist ✅ |
| **Phase 1** | 3–6 | SuperAdmin | 2–3 managers, regional lead | Phase 2 exit criteria met |
| **Phase 2** | 7–12 | Regional lead | 5–10 managers, SuperAdmin | Phase 3 exit criteria met |
| **Phase 3** | 13+ | Regional leads | All restaurants | Ongoing monitoring |

---

## 8. COMMON PITFALLS & HOW TO AVOID THEM

| Pitfall | Symptom | Prevention |
|---------|---------|---|
| **Noise kills adoption** | Digest ack rate drops <60% | Monitor false-positive rate weekly; increase threshold if >20% |
| **Backlog grows unchecked** | Flagged orders >20, all unreviewed | Daily manager review; SuperAdmin escalates if >15 for 2+ days |
| **Thresholds oscillate** | Different thresholds each week | Freeze thresholds for ≥2 weeks between changes |
| **Same store always top-5** | "System has it out for Store X" | Manager call within 2 days; investigate real vs. noise |
| **Operator outliers blamed unfairly** | "System is unfair" sentiment | Frame as learning opportunity, not accusation; validate with manager first |
| **SuperAdmin skips reviews** | Digest stacks unreviewed | AutoCalendar: recurring 15-min block daily |
| **Managers don't log in** | Adoption drops <60% | Weekly check-in call; ask "What's getting in the way?" |
| **Scope leaks (data access)** | Manager views wrong restaurant data | Code audit + test before each phase; quarterly access review |
| **Escalation routine breaks down** | Critical orders not actioned within 2h | Clear escalation chain; SuperAdmin owns it personally for Phase 1 |
| **Performance degrades** | Digest takes >10 sec to generate | Monitor digest generation time daily; alert if >5 sec |

---

## 9. FINAL SIGN-OFF

**This plan is ready to execute when:**

- [ ] Platform team confirms Phase 0 test environment ready
- [ ] 2–3 volunteer restaurants identified for Phase 1
- [ ] SuperAdmin lead assigned (owns daily reviews + threshold tuning)
- [ ] Slack channels created (#offline-risk-pilot, #offline-risk-alerts)
- [ ] Manager guide + runbook shared with Phase 1 participants
- [ ] First digest generated successfully in staging

**Start Date:** Upon sign-off (Target: 2026-03-27)

---

**Next Action:** Confirm readiness → Kickoff Phase 0 → Run 2-week internal validation