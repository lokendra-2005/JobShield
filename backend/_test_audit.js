const { auditResumeArchitecture } = require('./services/auditResumeArchitecture');

// ── Test 1: Strong Full-Stack candidate ────────────────────────────────────────
const strong = auditResumeArchitecture(
`Experience
Architected a React + Node.js SaaS platform handling 100k users, reducing churn by 22%.
Deployed PostgreSQL database with query optimization cutting report time by 65%.
Migrated legacy monolith to AWS microservices, improving uptime to 99.97%.
Engineered TypeScript GraphQL API serving 8,000 requests per second with p99 latency under 50ms.
Projects
Built a Python ML fraud detector with F1-score of 0.93 and deployed it on AWS Lambda.
Designed a Redis caching layer reducing DB load by 80%.`,
  'Full-Stack Developer'
);

console.log('\n══════ TEST 1: STRONG FULL-STACK ══════');
console.log('finalScore    :', strong.finalScore);
console.log('logicCategory :', strong.logicCategory);
console.log('wordCount     :', strong.wordCount);
console.log('STRENGTHS:');
strong.strengths.forEach(s     => console.log('  + ' + s));
console.log('SUGGESTIONS:');
strong.topSuggestions.forEach(s => console.log('  ! ' + s));
console.log('BREAKDOWN:', JSON.stringify(strong.breakdown, null, 2));

// ── Test 2: Fluff-heavy weak resume with missing DB cluster ─────────────────
const weak = auditResumeArchitecture(
`I am a highly motivated self-starter and go-getter with synergy-driven results.
Excellent verbal and written communication skills. Passionate about technology.
Team player. Detail-oriented and a fast learner who thinks outside the box.
I am a Full-Stack developer. I know React and a little Node.js.
Made a website. Helped the team with various tasks. Dynamic individual.`,
  'Full-Stack Developer'
);

console.log('\n══════ TEST 2: WEAK / FLUFF HEAVY ══════');
console.log('finalScore    :', weak.finalScore);
console.log('logicCategory :', weak.logicCategory);
console.log('ANOMALIES:');
weak.flaggedAnomalies.forEach(a => console.log('  X ' + a));
console.log('SUGGESTIONS:');
weak.topSuggestions.forEach(s  => console.log('  ! ' + s));
console.log('BREAKDOWN:', JSON.stringify(weak.breakdown, null, 2));
