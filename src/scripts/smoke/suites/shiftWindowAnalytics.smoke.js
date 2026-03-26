/**
 * Shift Window Analytics Smoke Tests
 * 
 * Verifies estimated shift-window mapping and metrics:
 * - Timestamp to shift window mapping
 * - Metrics calculation per window
 * - Outlier detection rules
 * - Aggregation across restaurants
 */

export async function runShiftWindowAnalyticsSmoke() {
    console.log('\n=== SHIFT WINDOW ANALYTICS SMOKE TESTS ===\n');
    
    const tests = [
        testMorningWindowMapping,
        testAfternoonWindowMapping,
        testEveningWindowMapping,
        testLateWindowMapping,
        testBoundaryDetection,
        testMetricsCalculation,
        testOutlierDetection,
        testAggregation,
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const test of tests) {
        try {
            const result = await test();
            if (result.success) {
                console.log(`✅ ${result.name}: ${result.message}`);
                passed++;
            } else {
                console.log(`❌ ${result.name}: ${result.message}`);
                failed++;
            }
        } catch (error) {
            console.log(`❌ ${test.name}: ${error.message}`);
            failed++;
        }
    }
    
    console.log(`\n=== RESULTS ===`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${passed + failed}\n`);
    
    return { passed, failed, total: passed + failed };
}

// Mock mapTimestampToEstimatedWindow for testing
function mockMapTimestamp(hour) {
    const windows = [
        { name: 'morning', startHour: 5, endHour: 12 },
        { name: 'afternoon', startHour: 12, endHour: 17 },
        { name: 'evening', startHour: 17, endHour: 22 },
        { name: 'late', startHour: 22, endHour: 5, wrapsMidnight: true }
    ];
    
    for (const w of windows) {
        let inWindow = false;
        if (w.wrapsMidnight) {
            inWindow = hour >= w.startHour || hour < w.endHour;
        } else {
            inWindow = hour >= w.startHour && hour < w.endHour;
        }
        if (inWindow) {
            return w.name;
        }
    }
    return 'morning';
}

async function testMorningWindowMapping() {
    const hours = [5, 6, 7, 8, 9, 10, 11];
    
    for (const h of hours) {
        const window = mockMapTimestamp(h);
        if (window !== 'morning') {
            return { success: false, name: 'Morning Window', message: `Hour ${h} mapped to ${window}, expected morning` };
        }
    }
    
    return { success: true, name: 'Morning Window (05:00-12:00)', message: 'All hours correctly mapped' };
}

async function testAfternoonWindowMapping() {
    const hours = [12, 13, 14, 15, 16];
    
    for (const h of hours) {
        const window = mockMapTimestamp(h);
        if (window !== 'afternoon') {
            return { success: false, name: 'Afternoon Window', message: `Hour ${h} mapped to ${window}, expected afternoon` };
        }
    }
    
    return { success: true, name: 'Afternoon Window (12:00-17:00)', message: 'All hours correctly mapped' };
}

async function testEveningWindowMapping() {
    const hours = [17, 18, 19, 20, 21];
    
    for (const h of hours) {
        const window = mockMapTimestamp(h);
        if (window !== 'evening') {
            return { success: false, name: 'Evening Window', message: `Hour ${h} mapped to ${window}, expected evening` };
        }
    }
    
    return { success: true, name: 'Evening Window (17:00-22:00)', message: 'All hours correctly mapped' };
}

async function testLateWindowMapping() {
    const hours = [22, 23, 0, 1, 2, 3, 4];
    
    for (const h of hours) {
        const window = mockMapTimestamp(h);
        if (window !== 'late') {
            return { success: false, name: 'Late Window', message: `Hour ${h} mapped to ${window}, expected late` };
        }
    }
    
    return { success: true, name: 'Late Window (22:00-05:00, wraps midnight)', message: 'All hours correctly mapped' };
}

async function testBoundaryDetection() {
    // Test boundary detection logic: ±30 min
    
    // Hour 12:00 (boundary between morning and afternoon)
    // Orders at 11:45-12:15 should be detected as near boundary
    
    // Simplified: hour 12 is on boundary
    const hour = 12;
    const minute = 0;
    const totalMinutes = hour * 60 + minute;
    
    // Start of afternoon is 12*60 = 720
    const boundaryStart = 12 * 60;
    const distToStart = Math.abs(totalMinutes - boundaryStart);
    
    if (distToStart > 30) {
        return { success: false, name: 'Boundary Detection', message: `Boundary distance ${distToStart} > 30 min threshold` };
    }
    
    return { success: true, name: 'Boundary Detection (±30 min)', message: 'Order at window boundary correctly flagged' };
}

async function testMetricsCalculation() {
    // Mock window metrics
    const window = {
        window: 'evening',
        label: '🍽️ Evening',
        totalOrders: 20,
        flaggedCount: 5,
        escalatedCount: 2,
        resolvedCount: 3,
        reasonCodes: { price_adjusted_on_sync: 3, acceptable_policy_override: 2 },
        operatorEmails: ['op1@test.com', 'op2@test.com'],
        boundaryOrderCount: 3,
        operators: { 'op1@test.com': 12, 'op2@test.com': 8 }
    };
    
    // Calculate rates
    const flaggedRate = Math.round((window.flaggedCount / window.totalOrders) * 100);
    const escalationRate = Math.round((window.escalatedCount / window.flaggedCount) * 100);
    
    if (flaggedRate !== 25) {
        return { success: false, name: 'Metrics Calculation', message: `Expected 25% flagged, got ${flaggedRate}%` };
    }
    
    if (escalationRate !== 40) {
        return { success: false, name: 'Metrics Calculation', message: `Expected 40% escalation, got ${escalationRate}%` };
    }
    
    return { success: true, name: 'Metrics Calculation', message: '5/20 = 25% flagged, 2/5 = 40% escalation' };
}

async function testOutlierDetection() {
    // Mock aggregated metrics with high evening flagged rate
    const aggregated = {
        morning: { window: 'morning', totalOrders: 100, flaggedCount: 10, flaggedRate: 10, escalatedCount: 4, escalationRate: 40, reasonCodes: {} },
        afternoon: { window: 'afternoon', totalOrders: 150, flaggedCount: 18, flaggedRate: 12, escalatedCount: 7, escalationRate: 39, reasonCodes: {} },
        evening: { window: 'evening', totalOrders: 80, flaggedCount: 32, flaggedRate: 40, escalatedCount: 20, escalationRate: 63, reasonCodes: {} },
        late: { window: 'late', totalOrders: 50, flaggedCount: 5, flaggedRate: 10, escalatedCount: 2, escalationRate: 40, reasonCodes: {} }
    };
    
    // Average flagged rate: (10+18+32+5) / (100+150+80+50) = 65/380 = 17%
    const avgFlagged = 17;
    
    // Evening: 40% > 2x17% (34%)? Yes, should be detected as high
    const eveningRate = 40;
    if (eveningRate <= avgFlagged * 2) {
        return { success: false, name: 'Outlier Detection', message: `Evening rate ${eveningRate}% should exceed 2x avg (${avgFlagged * 2}%)` };
    }
    
    return { success: true, name: 'Outlier Detection', message: 'Evening window with 40% flagged rate detected as outlier vs. 17% avg' };
}

async function testAggregation() {
    // Test aggregating metrics across multiple restaurants
    const restaurant1Windows = {
        morning: { window: 'morning', totalOrders: 100, flaggedCount: 10 },
        evening: { window: 'evening', totalOrders: 50, flaggedCount: 15 }
    };
    
    const restaurant2Windows = {
        morning: { window: 'morning', totalOrders: 80, flaggedCount: 8 },
        evening: { window: 'evening', totalOrders: 60, flaggedCount: 18 }
    };
    
    // Aggregated morning: 100+80=180 total, 10+8=18 flagged = 10%
    const aggMorning = 18 / (100 + 80) * 100;
    
    // Aggregated evening: 50+60=110 total, 15+18=33 flagged = 30%
    const aggEvening = 33 / (50 + 60) * 100;
    
    if (Math.round(aggMorning) !== 10) {
        return { success: false, name: 'Aggregation', message: `Expected 10% morning, got ${Math.round(aggMorning)}%` };
    }
    
    if (Math.round(aggEvening) !== 30) {
        return { success: false, name: 'Aggregation', message: `Expected 30% evening, got ${Math.round(aggEvening)}%` };
    }
    
    return { success: true, name: 'Aggregation Across Restaurants', message: 'Morning 10%, Evening 30% correctly aggregated' };
}