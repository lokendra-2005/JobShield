'use strict';
const { analyzeJobRisk, analyzeLinkRisk } = require('./utils/riskEngine');

// ── JOB TESTS ─────────────────────────────────────────────────────────────────

// ZT-1: MNC Integrity Check
const job1 = analyzeJobRisk('We are TCS, please pay a refundable security deposit of ₹5000 before joining.');
console.log('ZT-1 MNC Integrity Check:');
console.log('  Score:', job1.score, '(expected 98)');
console.log('  Flags:', job1.detectedFlags.filter(f => f.includes('ZERO-TRUST')));

// ZT-2: Salary-Skill Anomaly
const job2 = analyzeJobRisk('Data Entry job opening! Salary ₹45,000 per month. Work from home. No experience needed.');
console.log('\nZT-2 Salary-Skill Anomaly:');
console.log('  Score:', job2.score, '(expected >= 50 bonus applied)');
console.log('  Flags:', job2.detectedFlags.filter(f => f.includes('ZERO-TRUST')));

// ZT-3: Linguistic Pressure
const job3 = analyzeJobRisk('You must pay the processing fee within 24 hours. Failure to pay will result in offer cancellation.');
console.log('\nZT-3 Linguistic Pressure:');
console.log('  Score:', job3.score, '(expected high — +30 penalty)');
console.log('  Flags:', job3.detectedFlags.filter(f => f.includes('ZERO-TRUST')));

// ── LINK TESTS ────────────────────────────────────────────────────────────────

// ZT-L1: Obfuscation
const link1 = analyzeLinkRisk('https://bit.ly/3xFakeJob');
console.log('\nZT-L1 Obfuscation Penalty (bit.ly):');
console.log('  Score:', link1.score, '| Level:', link1.riskLevel);
console.log('  ZT Flags:', link1.detectedSignals.filter(s => s.includes('ZERO-TRUST')));

// ZT-L2: Hop Gravity
const link2 = analyzeLinkRisk('https://malicious.xyz/go?url=https://second.com&next=https://third.com&r=https://final.xyz');
console.log('\nZT-L2 Hop Gravity (3 nested URLs):');
console.log('  Score:', link2.score, '| Level:', link2.riskLevel, '(expected CRITICAL)');
console.log('  ZT Flags:', link2.detectedSignals.filter(s => s.includes('ZERO-TRUST')));

// ZT-L3: Bypass Check
const link3 = analyzeLinkRisk('https://httpbin.org/redirect-to?url=https://phishingsite.xyz/steal-data');
console.log('\nZT-L3 Bypass Check (httpbin):');
console.log('  Score:', link3.score, '| Level:', link3.riskLevel, '(expected CRITICAL)');
console.log('  ZT Flags:', link3.detectedSignals.filter(s => s.includes('ZERO-TRUST')));

console.log('\n✅ Zero-Trust smoke test complete.');
