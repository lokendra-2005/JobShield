'use strict';

/**
 * advancedJobThreatAnalyzer.js
 * Job Shield — Heuristic Threat Matrix Engine
 *
 * Design principles:
 *  - No raw .includes() or .match(hardcodedWord) — every signal is regex-based
 *    with word-boundary anchors to avoid false partial matches.
 *  - Salary analysis is cross-referenced against a Skill Barrier table so a 40k
 *    offer for a React dev is SAFE while 40k for "data entry" is CRITICAL.
 *  - Each anomaly produces a named signal + confidence weight, not just a boolean.
 *  - Final score is a weighted sum clamped 0–100, mapped to SAFE / SUSPICIOUS / CRITICAL.
 */

// ─── Skill Barrier Table ──────────────────────────────────────────────────────
// Maps skill categories to their realistic annual salary floor (USD).
// Any offer BELOW this floor triggers a Compensation-Skill Anomaly signal.
// Categories are ordered from highest-barrier to lowest so the first match wins.
const SKILL_SALARY_FLOORS = [
    // High-skill / High-barrier tech roles → legitimate 40k+ offers are normal
    { category: 'AI/ML Engineer',       floor: 80_000, patterns: [/\b(machine.?learning|deep.?learning|llm|pytorch|tensorflow|nlp|computer.?vision|ai.?engineer)\b/i] },
    { category: 'Blockchain/Web3',      floor: 70_000, patterns: [/\b(web3|solidity|blockchain|smart.?contract|defi|nft|rust.?developer)\b/i] },
    { category: 'Full-Stack Dev',       floor: 60_000, patterns: [/\b(full.?stack|react|next\.?js|vue|angular|node\.?js|typescript|graphql)\b/i] },
    { category: 'Mobile Dev',           floor: 60_000, patterns: [/\b(ios|android|flutter|swift|kotlin|react.?native)\b/i] },
    { category: 'Cloud/DevOps',         floor: 70_000, patterns: [/\b(aws|azure|gcp|kubernetes|docker|devops|site.?reliability|terraform)\b/i] },
    { category: 'Cybersecurity',        floor: 65_000, patterns: [/\b(penetration.?test|ethical.?hack|soc.?analyst|ceh|cissp|cybersecurity.?engineer)\b/i] },
    { category: 'Data Science',         floor: 65_000, patterns: [/\b(data.?scientist|data.?engineer|pandas|spark|hadoop|sql.?server|power.?bi)\b/i] },
    { category: 'Backend Dev',          floor: 55_000, patterns: [/\b(java.?developer|python.?developer|django|spring.?boot|go.?lang|c\+\+)\b/i] },
    // Low-skill / Low-barrier roles → very low offers are the scam signal
    { category: 'Data Entry',           floor: 18_000, patterns: [/\b(data.?entry|typist|form.?filler|copy.?paste|typing.?job)\b/i] },
    { category: 'Content Moderator',    floor: 20_000, patterns: [/\b(content.?moderati|social.?media.?manager|community.?manager)\b/i] },
    { category: 'Customer Support',     floor: 22_000, patterns: [/\b(customer.?(support|service|care)|help.?desk|live.?chat.?agent)\b/i] },
    { category: 'Virtual Assistant',    floor: 18_000, patterns: [/\b(virtual.?assistant|va.?role|general.?assistant)\b/i] },
    { category: 'Survey/Task Worker',   floor: 10_000, patterns: [/\b(online.?survey|micro.?task|task.?completion|click.?work|mturk)\b/i] },
];

// ─── Linguistic Coercion Patterns ─────────────────────────────────────────────
// Each entry: { signal, regex, weight }
// weight: how many risk points this signal contributes (1–15)
const COERCION_SIGNALS = [
    { signal: 'Urgency: immediate action demanded',   weight: 12, re: /\b(act\s+immediately|respond\s+in\s+24\s+hours?|limited\s+slot|only\s+\d+\s+position|apply\s+now\s+or\s+miss|last\s+chance|offer\s+expires?\s+today)\b/i },
    { signal: 'Pressure: scarcity manipulation',      weight: 10, re: /\b(first\s+come\s+first\s+served|positions?\s+fill\s+fast|hurry|before\s+(it\'s|its)\s+too\s+late|only\s+accepting\s+today)\b/i },
    { signal: 'Financial pre-condition: fee demand',  weight: 20, re: /\b(security\s+deposit|registration\s+fee|processing\s+fee|training\s+material\s+fee|background\s+check\s+fee|refundable\s+deposit|pay\s+(to|before)\s+(start|join|work))\b/i },
    { signal: 'Whatsapp-only recruitment',            weight: 14, re: /\b(contact\s*(us|me)?\s*on\s*whatsapp|whatsapp\s*(number|interview|only)|reach\s*(us|me)?\s*(via|through|on)\s*whatsapp)\b/i },
    { signal: 'Unsolicited richness promise',         weight: 12, re: /\b(earn\s+up\s+to?\s+\$?\d{3,}k?\s+per\s+(day|week)|work\s+from\s+home\s+and\s+earn|passive\s+income\s+guaran|get\s+rich|unlimited\s+earning)\b/i },
    { signal: 'No interview / instant hire',          weight: 10, re: /\b(no\s+interview\s+required|immediate(ly)?\s+hired|you('re|\s+are)\s+hired|hired\s+without\s+interview|start\s+today\s+no\s+experience)\b/i },
    { signal: 'Vague or no company name',             weight:  6, re: /\b(reputed\s+(mnc|company|firm)|leading\s+company\s+name\s+undisclosed|confidential\s+company|anonymous\s+employer|name\s+withheld)\b/i },
    { signal: 'Age targeting (unusual)',              weight:  6, re: /\b((housewife|student|fresher|retired)\s+(can|may)\s+(apply|earn)|no\s+age\s+limit|any\s+age)\b/i },
    { signal: 'Crypto/gift-card payment offer',       weight: 16, re: /\b(pay(ment)?\s+(in|via|through)\s+(bitcoin|crypto|ethereum|usdt|gift\s?card)|paid\s+in\s+crypto)\b/i },
];

// ─── Obfuscation Patterns ─────────────────────────────────────────────────────
const OBFUSCATION_SIGNALS = [
    { signal: 'Leetspeak / symbol substitution in contact info', weight: 14,
      re: /[a-z0-9@](@|＠|\[at\]|\(at\))[a-z0-9]/ },   // non-standard @ signs
    { signal: 'Zero-width / invisible characters present',       weight: 18,
      re: /[\u200B-\u200D\uFEFF\u00AD\u034F\u2060]/ },
    { signal: 'Suspicious personal email domain for HR',         weight: 12,
      re: /\b(hr|recruit|hiring)\b.{0,40}@(gmail|yahoo|hotmail|outlook|proton)\.(com|net|org)/i },
    { signal: 'Typosquatted brand email',                        weight: 16,
      re: /@(g00gle|lnkedin|linkedln|microsofit|amaz0n|faceb00k|appl3)\./i },
    { signal: 'Whatsapp obfuscation (wh@tsapp / whasaap)',       weight: 12,
      re: /\bwh@ts|wh4ts|whasaap|whatsaap|whtsapp\b/i },
    { signal: 'URL masking / IP address in link',                weight: 15,
      re: /https?:\/\/(\d{1,3}\.){3}\d{1,3}|bit\.ly\/|tinyurl\.com\/|t\.co\/[^\s]{1,10}/i },
    { signal: 'Excessive ALL-CAPS pressure words',               weight:  8,
      test: (text) => {
          const capsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).length;
          const totalWords = (text.match(/\b\w+\b/g) || []).length || 1;
          return (capsWords / totalWords) > 0.10; // >10% all-caps words
      }},
];

// ─── Compensation-Skill Anomaly Detection ─────────────────────────────────────
/**
 * Returns a signal object if the offered salary is anomalously low relative to
 * the detected skill level, or null if no anomaly is found.
 *
 * annualSalary: number (USD). Pass 0 if unknown — no penalty applied.
 */
function detectCompensationAnomaly(text, annualSalary) {
    if (!annualSalary || annualSalary <= 0) return null;

    // Find the first skill category present in the text
    for (const entry of SKILL_SALARY_FLOORS) {
        const matched = entry.patterns.some(p => p.test(text));
        if (!matched) continue;

        const pctOfFloor = annualSalary / entry.floor;

        if (pctOfFloor < 0.45) {
            // Offer is less than 45% of the realistic floor → CRITICAL anomaly
            return {
                signal: `Compensation-Skill Anomaly [${entry.category}]: offered $${annualSalary.toLocaleString()} is ${Math.round(pctOfFloor * 100)}% of the $${entry.floor.toLocaleString()} market floor`,
                weight: 25,
                severity: 'CRITICAL',
            };
        }
        if (pctOfFloor < 0.70) {
            // Below 70% of floor → SUSPICIOUS
            return {
                signal: `Low Compensation [${entry.category}]: offered $${annualSalary.toLocaleString()} is ${Math.round(pctOfFloor * 100)}% of the $${entry.floor.toLocaleString()} market floor`,
                weight: 12,
                severity: 'SUSPICIOUS',
            };
        }
        // Salary is reasonable for skill level — no anomaly
        return null;
    }
    return null;
}

// ─── Score → Threat Level mapper ──────────────────────────────────────────────
function scoreToThreatLevel(score) {
    if (score >= 60) return 'CRITICAL';
    if (score >= 28) return 'SUSPICIOUS';
    return 'SAFE';
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
/**
 * advancedJobThreatAnalyzer(jobText, offeredSalary)
 *
 * @param {string} jobText       - Full text of the job posting
 * @param {number} offeredSalary - Annual salary in USD (0 if not stated)
 * @returns {{ threatLevel, riskScore, flaggedAnomalies, breakdown }}
 */
function advancedJobThreatAnalyzer(jobText = '', offeredSalary = 0) {
    // Defensive: coerce inputs to safe types
    const text   = typeof jobText      === 'string' ? jobText      : String(jobText ?? '');
    const salary = typeof offeredSalary === 'number' ? offeredSalary : parseFloat(offeredSalary) || 0;

    const flaggedAnomalies = [];
    let   rawScore         = 0;

    // 1. Compensation-skill anomaly
    const compAnomaly = detectCompensationAnomaly(text, salary);
    if (compAnomaly) {
        flaggedAnomalies.push({ category: 'Compensation', ...compAnomaly });
        rawScore += compAnomaly.weight;
    }

    // 2. Linguistic coercion signals
    for (const sig of COERCION_SIGNALS) {
        if (sig.re.test(text)) {
            flaggedAnomalies.push({ category: 'Coercion', signal: sig.signal, weight: sig.weight, severity: sig.weight >= 15 ? 'CRITICAL' : 'SUSPICIOUS' });
            rawScore += sig.weight;
        }
    }

    // 3. Obfuscation signals
    for (const sig of OBFUSCATION_SIGNALS) {
        const triggered = sig.test ? sig.test(text) : sig.re.test(text);
        if (triggered) {
            flaggedAnomalies.push({ category: 'Obfuscation', signal: sig.signal, weight: sig.weight, severity: sig.weight >= 15 ? 'CRITICAL' : 'SUSPICIOUS' });
            rawScore += sig.weight;
        }
    }

    // 4. Clamp to 0–100 and map to threat level
    const riskScore   = Math.min(100, Math.max(0, Math.round(rawScore)));
    const threatLevel = scoreToThreatLevel(riskScore);

    // 5. Breakdown summary by category
    const breakdown = flaggedAnomalies.reduce((acc, a) => {
        acc[a.category] = (acc[a.category] || 0) + a.weight;
        return acc;
    }, {});

    return {
        threatLevel,
        riskScore,
        flaggedAnomalies,
        breakdown,
        meta: {
            analyzedChars: text.length,
            offeredSalary: salary,
            signalsChecked: COERCION_SIGNALS.length + OBFUSCATION_SIGNALS.length + SKILL_SALARY_FLOORS.length + 1,
        },
    };
}

module.exports = { advancedJobThreatAnalyzer };
