// Smoke test — EnterpriseJobThreatAnalyzer + AdvancedATSResumeScorer v2
const { EnterpriseJobThreatAnalyzer } = require('./services/EnterpriseJobThreatAnalyzer');
const { AdvancedATSResumeScorer }     = require('./services/AdvancedATSResumeScorer');

// ── TEST 1: Scam email targeting React internship ──────────────────────────
console.log('\n══════ TEST 1: Scam Post (Data Entry, $40k over-promise) ══════');
const t1 = EnterpriseJobThreatAnalyzer(
    `Work from home! Data Entry / Typing job — earn $40,000/year with zero experience.
     Pay a refundable security deposit of $49 to get your starter kit.
     Contact HR on WhatsApp only: +91-9876543210. Limited slots — act immediately!
     Email: hr.jobs@gmail.com`
);
console.log('Status    :', t1.status);
console.log('RiskScore :', t1.riskScore);
console.log('Threats   :\n ', t1.threatVectors.join('\n  '));
console.log('Trust     :', t1.trustSignals);

// ── TEST 2: Legit corporate internship email ───────────────────────────────
console.log('\n══════ TEST 2: Legit Corporate Internship (React, $20k stipend) ══════');
const t2 = EnterpriseJobThreatAnalyzer(
    `Dear Candidate, Congratulations! You have been selected for a 2-month internship
     at Infosys Ltd (NSE: INFY) as a Full-Stack React/Node.js Developer Intern.
     Stipend: USD 20,000 per annum equivalent. You will receive a formal offer letter from
     hr@infosys.com. Background verification (BGV) will be conducted by a third-party agency.
     This offer is subject to applicable law and equal opportunity employer guidelines.
     Probation period of 2 months applies. Apply via our official careers portal.`
);
console.log('Status    :', t2.status);
console.log('RiskScore :', t2.riskScore);
console.log('Threats   :', t2.threatVectors.length ? t2.threatVectors : '(none)');
console.log('Trust     :\n ', t2.trustSignals.join('\n  '));

// ── TEST 3: ATS Resume — strong candidate with one stuffed keyword ─────────
console.log('\n══════ TEST 3: ATS Resume Scorer (React stuffed, strong Node/Python) ══════');
const t3 = AdvancedATSResumeScorer(
    `EXPERIENCE
     Software Engineer — Acme Corp (2022–2024)
     • Architected a Node.js microservice handling 50,000 requests/sec, reducing p99 latency by 40%.
     • Optimized PostgreSQL query performance, cutting report generation time by 65%.
     • Led the TypeScript migration of 6 legacy services, improving type coverage to 94%.

     PROJECTS
     • Built a Python FastAPI fraud-detection API (F1-score: 0.93, deployed to AWS Lambda).
     • Deployed a React dashboard used by 8,000 active users; reduced page load by 35%.

     HOBBIES
     React React React React React React React React React React React React React`,
    ['React', 'Node.js', 'Python', 'TypeScript', 'AWS', 'GraphQL']
);
console.log('ATS Score        :', t3.atsScore + '%');
console.log('Stuffing Warning :', t3.stuffingWarning);
console.log('Verified Skills  :');
t3.verifiedSkills.forEach(s =>
    console.log(`  ${s.skill.padEnd(12)} score:${String(s.score).padStart(5)}%  ctx:${s.contextRatio}%  sec:${s.topSection}  verb:"${s.bestVerb}"  metric:"${s.bestMetric}"  stuffed:${s.stuffingFlag}`)
);
console.log('Missing          :', t3.missingSkills);
console.log('Manipulations    :\n ', t3.flaggedManipulations.join('\n  ') || '(none)');
console.log('\nActionable Feedback:');
t3.actionableFeedback.forEach((tip, i) => console.log(`  [${i+1}] ${tip}`));
