'use strict';

/**
 * EnterpriseJobThreatAnalyzer.js
 * Job Shield — Enterprise Threat Heuristic Engine v2
 *
 * Architecture:
 *  1. Entity Matrix Validation  — Role × Skill × Salary cross-reference
 *  2. Linguistic Coercion Layer — Contextual NLP threat pattern detection
 *  3. Legitimacy Signal Layer   — Corporate boilerplate positive weighting
 *  4. Obfuscation & Channel Layer — Encoding tricks, suspicious contact vectors
 *
 * Scoring philosophy:
 *  - Threat signals ADD to riskScore (0→100).
 *  - Trust signals SUBTRACT from riskScore (capped floor: 0).
 *  - Final riskScore drives status: Clean (<25) | Suspicious (25-59) | Critical (≥60).
 *  - No single category can contribute more than its defined MAX_WEIGHT cap.
 */

// ══════════════════════════════════════════════════════════════════
// ENTITY MATRIX — Role × Skill × Salary
// ══════════════════════════════════════════════════════════════════

/**
 * Skill tiers define the realistic salary floor for each category.
 * annualFloor: conservative market minimum (USD) for full-time.
 * internFloor: realistic stipend floor for a **2-month** internship (USD annual equivalent).
 *
 * We detect the role type (fulltime vs internship) and choose the appropriate floor.
 */
const SKILL_MATRIX = [
    {
        tier: 'Elite Tech',
        annualFloor: 80_000, internFloor: 30_000,
        patterns: [/\b(machine[\s-]?learning|deep[\s-]?learning|llm|gpt|pytorch|tensorflow|nlp|computer[\s-]?vision|reinforcement[\s-]?learning|ai[\s-]?engineer|mlops)\b/i],
    },
    {
        tier: 'High-Skill Dev',
        annualFloor: 65_000, internFloor: 20_000,
        patterns: [/\b(full[\s-]?stack|react[\s-]?js|next[\s-]?js|angular|vue[\s-]?js|node[\s-]?js|typescript|graphql|web3|solidity|blockchain|smart[\s-]?contract)\b/i],
    },
    {
        tier: 'Backend / Infra',
        annualFloor: 60_000, internFloor: 18_000,
        patterns: [/\b(java\s+developer|spring[\s-]?boot|golang|rust\s+dev|c\+\+\s+engineer|systems?\s+programmer|database\s+engineer|sql\s+server|postgres)\b/i],
    },
    {
        tier: 'Cloud / DevOps',
        annualFloor: 70_000, internFloor: 22_000,
        patterns: [/\b(aws|azure|gcp|kubernetes|k8s|docker|devops|sre|site[\s-]?reliability|terraform|ci[\s-]?cd|jenkins)\b/i],
    },
    {
        tier: 'Data Science',
        annualFloor: 65_000, internFloor: 18_000,
        patterns: [/\b(data\s+scientist|data\s+engineer|data\s+analyst|pandas|spark|hadoop|tableau|power\s+bi|looker)\b/i],
    },
    {
        tier: 'Cybersecurity',
        annualFloor: 68_000, internFloor: 20_000,
        patterns: [/\b(penetration\s+test|ethical\s+hack|soc\s+analyst|ceh|cissp|cybersecurity\s+engineer|threat\s+intel|vuln[\w]*\s+assess)\b/i],
    },
    {
        tier: 'Mobile Dev',
        annualFloor: 60_000, internFloor: 18_000,
        patterns: [/\b(ios\s+dev|android\s+dev|flutter|swift|kotlin|react[\s-]?native|mobile\s+engineer)\b/i],
    },
    {
        tier: 'Design / PM',
        annualFloor: 50_000, internFloor: 15_000,
        patterns: [/\b(ui[\s/]?ux\s+designer|product\s+manager|scrum\s+master|figma\s+designer|product\s+designer)\b/i],
    },
    {
        tier: 'Low-Skill Admin',  // offers well above floor here are suspicious TOO (over-promise)
        annualFloor: 18_000, internFloor: 8_000,
        overPromiseFloor: 45_000,  // offering >$45k for data entry = scam red flag
        patterns: [/\b(data\s+entry|copy[\s-]?paste|form\s+filler|typist|typing\s+job|basic\s+computer\s+work)\b/i],
    },
    {
        tier: 'Survey / Micro-Task',
        annualFloor: 8_000, internFloor: 3_000,
        overPromiseFloor: 20_000,
        patterns: [/\b(online\s+survey|micro[\s-]?task|task\s+completion|click\s+work|watch\s+ads?\s+and\s+earn)\b/i],
    },
    {
        tier: 'Virtual Assistant',
        annualFloor: 16_000, internFloor: 6_000,
        overPromiseFloor: 40_000,
        patterns: [/\b(virtual\s+assistant|va\s+role|general\s+virtual\s+help|remote\s+personal\s+assistant)\b/i],
    },
];

// Detect role type from text
const INTERNSHIP_PATTERN = /\b(intern(ship)?|trainee|apprentice|co[\s-]?op|placement\s+student|graduate\s+program)\b/i;
const FULLTIME_PATTERN   = /\b(full[\s-]?time|permanent\s+role|salaried\s+position|regular\s+employee|direct\s+hire)\b/i;

/**
 * Parse salary from text. Handles: $40k, ₹40,000, 40000/month, USD 90,000 per year.
 * Returns annual USD equivalent (best effort).
 */
function parseSalary(text) {
    // Monthly → annualised ×12
    const monthly = text.match(/[\$₹£€]?\s*(\d[\d,]*)\s*(?:k)?\s*(?:\/|\s+per\s+)month/i);
    if (monthly) {
        const raw = parseFloat(monthly[1].replace(/,/g, '')) * (monthly[0].toLowerCase().includes('k') ? 1000 : 1);
        return raw * 12;
    }
    // "Xk/year" or "X,000 per annum"
    const annual = text.match(/[\$₹£€]?\s*(\d[\d,]*)\s*(k)?\s*(?:\/|\s+per\s+)?(?:year|annum|pa|annually|p\.a\.)/i);
    if (annual) {
        const raw = parseFloat(annual[1].replace(/,/g, '')) * (annual[2] ? 1000 : 1);
        return raw;
    }
    // Plain "40k" or "$40,000" with no period qualifier — treat as annual
    const plain = text.match(/[\$₹£€]\s*(\d[\d,]*)\s*(k)?/);
    if (plain) {
        return parseFloat(plain[1].replace(/,/g, '')) * (plain[2] ? 1000 : 1);
    }
    return 0;
}

function buildEntityMatrixSignals(text, salary) {
    const signals  = [];
    const isIntern = INTERNSHIP_PATTERN.test(text);

    for (const tier of SKILL_MATRIX) {
        if (!tier.patterns.some(p => p.test(text))) continue;

        const floor = isIntern ? tier.internFloor : tier.annualFloor;

        // Over-promise check (data-entry offering 60k/yr is certainly a scam)
        if (tier.overPromiseFloor && salary > 0 && salary >= tier.overPromiseFloor) {
            signals.push({
                vector: `Entity Matrix: "${tier.tier}" role offering $${salary.toLocaleString()}/yr (${Math.round(salary / tier.overPromiseFloor * 100)}% above realistic ceiling) — classic over-promise scam`,
                weight: 28, severity: 'CRITICAL',
            });
            return signals;
        }

        if (salary > 0) {
            const ratio = salary / floor;
            if (ratio < 0.40) {
                signals.push({
                    vector: `Entity Matrix: "${tier.tier}" ${isIntern ? 'internship' : 'role'} offering $${salary.toLocaleString()} vs $${floor.toLocaleString()} market floor — ${Math.round(ratio * 100)}% under-compensation (CRITICAL)`,
                    weight: 26, severity: 'CRITICAL',
                });
            } else if (ratio < 0.65) {
                signals.push({
                    vector: `Entity Matrix: "${tier.tier}" ${isIntern ? 'internship' : 'role'} offering $${salary.toLocaleString()} — ${Math.round(ratio * 100)}% of market floor (SUSPICIOUS)`,
                    weight: 12, severity: 'SUSPICIOUS',
                });
            }
            // ratio ≥ 0.65 = within normal range → no signal
        }
        break; // first matched tier wins
    }
    return signals;
}

// ══════════════════════════════════════════════════════════════════
// COERCION SIGNALS — Financial Traps & Psychological Manipulation
// ══════════════════════════════════════════════════════════════════
const COERCION_TABLE = [
    // ── Financial traps (weighted highest) ──────────────────────
    {
        vector: 'Financial trap: security deposit or fee-before-work demand',
        weight: 25, severity: 'CRITICAL',
        re: /\b(security\s+deposit|refundable\s+deposit|registration\s+fee|processing\s+fee|onboarding\s+(charge|fee)|training\s+(material\s+)?fee|background\s+check\s+fee|pay\s+(before|to)\s+(start|join|work)|advance\s+payment\s+required)\b/i,
    },
    {
        vector: 'Financial trap: crypto or gift-card payment method',
        weight: 22, severity: 'CRITICAL',
        re: /\b(pay(ment)?\s+(in|via|through)\s+(bitcoin|crypto|eth|usdt|litecoin|gift[\s-]?card|google\s+play|amazon\s+gift)|salary\s+in\s+crypto|earn\s+bitcoin)\b/i,
    },
    {
        vector: 'Financial trap: money-mule / wallet transfer request',
        weight: 30, severity: 'CRITICAL',
        re: /\b(receive\s+funds?\s+and\s+transfer|transfer\s+(the\s+)?(money|funds?|amount)\s+to|forward\s+payment|act\s+as\s+(our\s+)?(agent|intermediary)\s+for\s+transfer)\b/i,
    },
    // ── Urgency & scarcity tactics ────────────────────────────────
    {
        vector: 'Urgency tactic: artificial scarcity or deadline pressure',
        weight: 12, severity: 'SUSPICIOUS',
        re: /\b(respond\s+within\s+24\s+hours?|limited\s+slots?\s+available|first\s+come\s+first\s+served|offer\s+expires?\s+(today|tomorrow)|only\s+\d\s+positions?\s+left|act\s+(now|immediately)|last\s+opportunity)\b/i,
    },
    {
        vector: 'Urgency tactic: instant-hire without formal interview',
        weight: 14, severity: 'SUSPICIOUS',
        re: /\b(you\s+(are|re)\s+hired|no\s+interview\s+(required|needed)|hired\s+without\s+screening|start\s+immediately\s+no\s+docs?|instant\s+joining|same[\s-]?day\s+offer)\b/i,
    },
    // ── Psychological manipulation ─────────────────────────────────
    {
        vector: 'Manipulation: unrealistic earning promise',
        weight: 14, severity: 'SUSPICIOUS',
        re: /\b(earn\s+(?:up\s+to\s+)?\$?\d{3,}(?:k)?\s+per\s+(?:day|week)|passive\s+income\s+guaran|unlimited\s+earning\s+potential\s+(?:in|for)\s+(?:days?|weeks?)|get[\s-]?rich\s+(?:fast|quick)|double\s+your\s+salary)\b/i,
    },
    {
        vector: 'Manipulation: targeting vulnerable demographics unusually',
        weight: 8, severity: 'SUSPICIOUS',
        re: /\b((housewife|student|retired\s+person|fresher)\s+can\s+(apply|earn|work)|no\s+age\s+(?:bar|limit)\s+any\s+background|anyone\s+can\s+do\s+this)\b/i,
    },
    // ── Channel suspicion ─────────────────────────────────────────
    {
        vector: 'Suspicious channel: WhatsApp-only recruitment',
        weight: 16, severity: 'SUSPICIOUS',
        re: /\b(contact\s+(?:us|me|hr)?\s+(?:on|via|through|at)\s+whatsapp|whatsapp\s+(?:number|interview|only|us)|interview\s+(?:via|on)\s+whatsapp|reach\s+(?:us|me)\s+on\s+whatsapp)\b/i,
    },
    {
        vector: 'Suspicious channel: personal email for corporate HR',
        weight: 14, severity: 'SUSPICIOUS',
        re: /\b(?:hr|recruit|hiring|career|jobs?)(?:\s+\w+){0,4}@(?:gmail|yahoo|hotmail|outlook|protonmail|yopmail|mailinator)\.(?:com|net|org)\b/i,
    },
    {
        vector: 'Suspicious channel: anonymous company identity',
        weight: 10, severity: 'SUSPICIOUS',
        re: /\b(reputed\s+(?:mnc|company|firm)|leading\s+company\s+(?:name\s+)?undisclosed|confidential\s+employer|anonymous\s+recruiter|company\s+name\s+withheld)\b/i,
    },
];

// ══════════════════════════════════════════════════════════════════
// OBFUSCATION SIGNALS
// ══════════════════════════════════════════════════════════════════
const OBFUSCATION_TABLE = [
    {
        vector: 'Obfuscation: zero-width / invisible Unicode characters (text injection)',
        weight: 20, severity: 'CRITICAL',
        test: (t) => /[\u200B-\u200D\uFEFF\u00AD\u034F\u2060]/.test(t),
    },
    {
        vector: 'Obfuscation: symbol-substituted email or URL (leetspeak filter evasion)',
        weight: 16, severity: 'CRITICAL',
        test: (t) => /@(g00gle|lnkedin|linkedln|microsofit|amaz0n|faceb00k|appl3|paypol|paypa1)\./i.test(t),
    },
    {
        vector: 'Obfuscation: WhatsApp contact disguised with symbols',
        weight: 14, severity: 'SUSPICIOUS',
        test: (t) => /\bwh@ts|wh4ts|whasaap|whatsaap|whtsapp|w\.h\.a\.t\.s\.a\.p\.p\b/i.test(t),
    },
    {
        vector: 'Obfuscation: IP address or URL shortener used instead of domain',
        weight: 15, severity: 'SUSPICIOUS',
        test: (t) => /https?:\/\/(\d{1,3}\.){3}\d{1,3}|bit\.ly\/|tinyurl\.com\/|rb\.gy\/|t\.co\/\S{4,}/i.test(t),
    },
    {
        vector: 'Obfuscation: excessive ALL-CAPS pressure words (>12% of tokens)',
        weight: 8, severity: 'SUSPICIOUS',
        test: (t) => {
            const caps  = (t.match(/\b[A-Z]{4,}\b/g) || []).length;
            const total = (t.match(/\b\w+\b/g) || []).length || 1;
            return (caps / total) > 0.12;
        },
    },
];

// ══════════════════════════════════════════════════════════════════
// TRUST / LEGITIMACY SIGNALS  (reduce riskScore)
// ══════════════════════════════════════════════════════════════════
const TRUST_TABLE = [
    { signal: 'Official legal/compliance clause present',             credit: 8,  re: /\b(subject\s+to\s+(?:applicable\s+)?law|equal\s+opportunity\s+employer|eoe|aaa|data\s+protection|gdpr|hipaa\s+compliant)\b/i },
    { signal: 'Formal offer letter or employment contract reference',  credit: 7,  re: /\b(formal\s+offer\s+letter|employment\s+agreement|appointment\s+letter|join\s+on\s+or\s+before|hr\s+will\s+share\s+(?:the\s+)?(?:letter|docs))\b/i },
    { signal: 'Standard corporate benefits package mentioned',         credit: 6,  re: /\b(health\s+insurance|dental\s+(?:and\s+)?vision|401\s*\(?k\)?|paid\s+time\s+off|pto|employee\s+stock\s+(?:option|purchase)|esop)\b/i },
    { signal: 'Official job portal / ATS reference',                  credit: 5,  re: /\b(apply\s+(?:via|through|on)\s+(?:our\s+)?(?:careers?\s+(?:page|portal|site)|linkedin|greenhouse|lever|workday|brassring|taleo|icims))\b/i },
    { signal: 'Background check / reference check mentioned',         credit: 4,  re: /\b(background\s+(?:verification|check)|reference\s+check|bgv|third[\s-]?party\s+verification|document\s+verification)\b/i },
    { signal: 'Identified corporate domain email for contact',        credit: 8,  re: /\b(hr|recruit|talent|careers?|jobs?|hiring)\b.{0,60}@(?!(gmail|yahoo|hotmail|outlook|proton))[a-z0-9-]{3,}\.(com|io|co|org|net|in)\b/i },
    { signal: 'Company registration / CIN / tax ID reference',        credit: 9,  re: /\b(cin\s*:?\s*[A-Z]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}|gst\s*(?:no|number|in)?\s*:?\s*\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}|registered\s+(?:under|with)\s+(?:companies\s+act|mca|roc))\b/i },
    { signal: 'Stock exchange listed entity reference',               credit: 7,  re: /\b(listed\s+on\s+(?:nse|bse|nasdaq|nyse|lse)|publicly\s+traded|market\s+cap|(?:nse|bse):\s*[A-Z]{2,})\b/i },
    { signal: 'Formal probation / notice period terms',               credit: 5,  re: /\b(probation\s+period\s+of\s+\d|notice\s+period\s+(?:of\s+)?\d+\s+(?:days?|months?)|subject\s+to\s+(?:satisfactory|successful)\s+completion\s+of\s+probation)\b/i },
];

// ══════════════════════════════════════════════════════════════════
// SCORE → STATUS
// ══════════════════════════════════════════════════════════════════
function scoreToStatus(score) {
    if (score >= 60) return 'Critical';
    if (score >= 25) return 'Suspicious';
    return 'Clean';
}

// ══════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════
/**
 * EnterpriseJobThreatAnalyzer(jobEmailText, metadata?)
 *
 * @param {string} jobEmailText  Full plain-text of the job email / posting
 * @param {object} [metadata]    Optional: { salary?: number }  — pass if parsing failed externally
 * @returns {{ status, riskScore, threatVectors, trustSignals, entityMatrix, meta }}
 */
function EnterpriseJobThreatAnalyzer(jobEmailText = '', metadata = {}) {
    // Defensive coercion
    const text = typeof jobEmailText === 'string' ? jobEmailText : String(jobEmailText ?? '');
    const metaSalary = typeof metadata?.salary === 'number' ? metadata.salary : 0;

    const threatVectors = [];
    const trustSignals  = [];
    let   threatScore   = 0;
    let   trustCredit   = 0;

    // ── 1. Parse salary from text (or use metadata) ───────────────
    const parsedSalary = metaSalary > 0 ? metaSalary : parseSalary(text);

    // ── 2. Entity Matrix ──────────────────────────────────────────
    const entitySignals = buildEntityMatrixSignals(text, parsedSalary);
    for (const sig of entitySignals) {
        threatVectors.push(sig.vector);
        threatScore += sig.weight;
    }

    // ── 3. Coercion signals ───────────────────────────────────────
    for (const entry of COERCION_TABLE) {
        if (entry.re.test(text)) {
            threatVectors.push(entry.vector);
            threatScore += entry.weight;
        }
    }

    // ── 4. Obfuscation signals ────────────────────────────────────
    for (const entry of OBFUSCATION_TABLE) {
        if (entry.test(text)) {
            threatVectors.push(entry.vector);
            threatScore += entry.weight;
        }
    }

    // ── 5. Trust signals (will reduce final score) ────────────────
    for (const entry of TRUST_TABLE) {
        if (entry.re.test(text)) {
            trustSignals.push(entry.signal);
            trustCredit += entry.credit;
        }
    }

    // ── 6. Clamp final score ─────────────────────────────────────
    const rawScore  = Math.max(0, threatScore - trustCredit);
    const riskScore = Math.min(100, Math.round(rawScore));
    const status    = scoreToStatus(riskScore);

    return {
        status,
        riskScore,
        threatVectors,
        trustSignals,
        entityMatrix: {
            parsedSalary,
            isInternship: INTERNSHIP_PATTERN.test(text),
        },
        meta: {
            analyzedChars: text.length,
            threatSignalsChecked: COERCION_TABLE.length + OBFUSCATION_TABLE.length + SKILL_MATRIX.length,
            trustSignalsChecked:  TRUST_TABLE.length,
        },
    };
}

module.exports = { EnterpriseJobThreatAnalyzer };
