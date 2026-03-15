// Quick load test for THE THIRD EYE
const { analyzeThirdEye } = require('./services/thirdEye');

(async () => {
  // Test 1: Free email
  const t1 = await analyzeThirdEye('hr.recruiter@gmail.com');
  console.log('\n=== TEST 1: Free email ===');
  console.log('riskLevel:', t1.riskLevel, '| action:', t1.actionRecommended);
  console.log('verdict:', t1.verdict.slice(0, 80));

  // Test 2: Established domain (google.com ~10k+ days old)
  const t2 = await analyzeThirdEye('careers@google.com');
  console.log('\n=== TEST 2: Established domain (google.com) ===');
  console.log('riskLevel:', t2.riskLevel, '| domainAgeDays:', t2.domainAgeDays, '| action:', t2.actionRecommended);

  // Test 3: Empty input
  const t3 = await analyzeThirdEye('');
  console.log('\n=== TEST 3: Empty input ===');
  console.log('riskLevel:', t3.riskLevel, '| verdict:', t3.verdict);

  // Test 4: Bare domain
  const t4 = await analyzeThirdEye('infosys.com');
  console.log('\n=== TEST 4: infosys.com ===');
  console.log('riskLevel:', t4.riskLevel, '| domainAgeDays:', t4.domainAgeDays, '| action:', t4.actionRecommended);
})();
