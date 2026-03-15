'use strict';

// risk scoring engine - does all the analysis logic for jobs, links, and resumes
// TODO: split this into separate files at some point, it's getting big

// standard response shape - every analysis function returns this
function ShieldResponse(score, category, deductions, reasons) {
    return {
        score: Math.min(100, Math.max(0, Math.round(score))),
        category,
        deductions: deductions || [],
        reasons: reasons || [],
    };
}

// clamp helper
function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
}


// ── MODULE 1: LINK ANALYZER ──────────────────────────────────────────────
// starts health at 100, deducts points for each red flag found
// risk score = 100 - health (so higher risk = lower health)
// thresholds: 0-15 safe, 16-50 suspicious, 51+ dangerous
//
// MID-RISK grey area system (5 rules) fires after the main deductions
// Rule 1: generic form platform or unverified job board
// Rule 2: brand name in URL but not the real domain (typosquatting)
// Rule 3: legit ATS platform but company is unknown
// Rule 4: URL shortener (destination is hidden)
// Rule 5: weird TLD (.xyz etc.) but no obvious phishing keywords


/**
 * Trusted domain whitelist (safe list).
 * A URL whose hostname equals or ends with one of these is trusted.
 */
const SAFE_LIST = new Set([
    'google.com', 'linkedin.com', 'naukri.com', 'indeed.com',
    'glassdoor.com', 'monster.com', 'shine.com', 'timesjobs.com',
    'amazon.com', 'microsoft.com', 'apple.com', 'facebook.com',
    'twitter.com', 'github.com', 'stackoverflow.com', 'youtube.com',
    'infosys.com', 'tcs.com', 'wipro.com', 'accenture.com',
    'deloitte.com', 'ibm.com', 'cognizant.com', 'capgemini.com',
    'hcl.com', 'zoho.com', 'freshworks.com', 'razorpay.com',
    'gov.in', 'nic.in', 'edu', 'ac.in',
    // Third-party ATS platforms (trusted as infrastructure, not jobs per se)
    'lever.co', 'greenhouse.io', 'workday.com', 'myworkdayjobs.com',
    'smartrecruiters.com', 'icims.com', 'freshteam.com', 'zohorecruit.com',
    'breezy.hr', 'recruitee.com', 'ashbyhq.com', 'rippling.com',
]);

/** Suspicious TLDs trigger automatic deduction */
const SUSPICIOUS_TLDS = new Set([
    'xyz', 'top', 'link', 'info', 'biz',
    'tk', 'ml', 'ga', 'cf', 'gq',
    'click', 'icu', 'buzz', 'monster', 'rest',
    'sbs', 'bar', 'pw', 'win', 'download', 'loan',
]);

/**
 * OBSCURE_TLDS — Non-standard extensions that lack established trust.
 * Used by Rule 5 of the MID-RISK system.
 * These are different from SUSPICIOUS_TLDS: they do not trigger a −30
 * deduction alone, but ARE flagged as MID-RISK grey area when no
 * phishing keywords are present in the rest of the URL.
 */
const OBSCURE_TLDS = new Set([
    'xyz', 'online', 'co', 'biz', 'jobs', 'site', 'store',
    'info', 'mobi', 'name', 'pro', 'tel', 'travel', 'app',
    'dev', 'io', 'ai',   // not inherently malicious but non-legacy
]);

/**
 * PHISHING_KEYWORDS — Used by Rule 5 exclusion: if ANY of these appear
 * in the URL, the TLD alone is NOT classified as mid-risk grey area —
 * instead it already triggers the hard SUSPICIOUS_TLDS deduction.
 */
const PHISHING_KEYWORDS_RE = /verify|login|password|account|signin|secure|update|confirm|bank|credential|wallet|otp/i;

/** Known URL shortener hostnames */
const URL_SHORTENERS = new Set([
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl',
    'ow.ly', 'rb.gy', 'cutt.ly', 'clck.ru', 'shorturl.at',
    'is.gd', 'buff.ly', 'adf.ly',
]);

/**
 * GENERIC_FORM_PLATFORMS — Platforms that are legitimate but should not
 * be used for official hiring (Rule 1: Platform Mismatch).
 */
const GENERIC_FORM_PLATFORMS = [
    'forms.gle', 'docs.google.com', 'forms.google.com',
    'typeform.com', 'airtable.com', 'notion.so', 'notion.site',
    'jotform.com', 'surveymonkey.com', 'wufoo.com', 'cognito.cat',
];

/**
 * PUBLIC_JOB_AGGREGATORS — Large job boards where the poster is unverifiable
 * (Rule 1 subset: aggregator variant).
 */
const PUBLIC_JOB_AGGREGATORS = [
    'naukri.com', 'indeed.com', 'monster.com', 'shine.com',
    'timesjobs.com', 'glassdoor.com', 'foundit.in', 'iimjobs.com',
    'apna.co', 'linkedin.com',
];

/**
 * KNOWN_BRAND_ROOTS — Official corporate domain roots for Rule 2.
 * The check: does the URL look like a variation of one of these without
 * EXACTLY matching it?
 */
const KNOWN_BRAND_ROOTS = [
    'amazon', 'google', 'microsoft', 'apple', 'facebook', 'meta',
    'tcs', 'infosys', 'wipro', 'accenture', 'cognizant', 'ibm',
    'deloitte', 'capgemini', 'hcl', 'paytm', 'flipkart', 'razorpay',
    'hdfc', 'icici', 'sbi', 'axis', 'zomato', 'swiggy', 'ola', 'uber',
];

/**
 * OFFICIAL_BRAND_DOMAINS — Exact official domains for each brand root.
 * A URL is a brand variation (Rule 2) only if its hostname CONTAINS
 * a brand root BUT does NOT exactly match or end in the official domain.
 */
const OFFICIAL_BRAND_DOMAINS = new Set([
    'amazon.com', 'amazon.in', 'amazon.jobs',
    'google.com', 'google.co.in',
    'microsoft.com', 'careers.microsoft.com',
    'apple.com', 'jobs.apple.com',
    'facebook.com', 'meta.com',
    'tcs.com', 'careers.tcs.com',
    'infosys.com',
    'wipro.com',
    'accenture.com',
    'cognizant.com',
    'ibm.com',
    'deloitte.com',
    'capgemini.com',
    'hcl.com', 'hcltech.com',
    'paytm.com',
    'flipkart.com',
    'razorpay.com',
    'hdfcbank.com',
    'icicibank.com',
    'sbi.co.in',
    'axisbank.com',
    'zomato.com',
    'swiggy.com',
    'ola.com', 'olacabs.com',
    'uber.com',
]);

/**
 * THIRD_PARTY_ATS_ROOTS — Legitimate ATS platform root hostnames.
 * Used by Rule 3: third-party ATS re-direct.
 */
const THIRD_PARTY_ATS_ROOTS = [
    'jobs.lever.co', 'lever.co',
    'boards.greenhouse.io', 'greenhouse.io',
    'myworkdayjobs.com', 'workday.com',
    'smartrecruiters.com',
    'jobs.ashbyhq.com', 'ashbyhq.com',
    'icims.com',
    'freshteam.com',
    'breezy.hr',
    'recruitee.com',
    'zohorecruit.com',
    'rippling.com',
];

/**
 * Entropy / gibberish detector — looks for runs of 6+ consonants or
 * random alphanumeric slug patterns in the URL path/domain.
 * Returns true if the URL looks generated / gibberish.
 */
function hasHighEntropy(url) {
    // Long consonant clusters
    if (/[bcdfghjklmnpqrstvwxyz]{6,}/i.test(url)) return true;
    // Alphanumeric slug that looks random (e.g. "a3f7k2-job")
    if (/[a-z]{2,4}\d{3,}[a-z\-]{2,}/i.test(url)) return true;
    // Pure hex-looking path segments (hash-like)
    if (/\/[0-9a-f]{8,}(?:\/|$|\?)/i.test(url)) return true;
    return false;
}

/**
 * Check whether a hostname is in the SAFE_LIST.
 * Strips leading www. and checks exact match or parent domain match.
 */
function isInSafeList(hostname) {
    const h = hostname.replace(/^www\./, '').toLowerCase();
    if (SAFE_LIST.has(h)) return true;
    // Also check if it's a subdomain of a safe domain
    for (const safe of SAFE_LIST) {
        if (h === safe || h.endsWith('.' + safe)) return true;
    }
    return false;
}

/**
 * analyzeLinkRisk — Main export for URL/link analysis.
 *
 * Uses a deduction-based approach:
 *   Health Score starts at 100 and deductions are applied.
 *   Risk Score = 100 − Health Score (clamped 0–100).
 *
 * @param {string} url
 * @returns {ShieldResponse & { riskLevel, verdict, detectedSignals, trustSignals }}
 */
function analyzeLinkRisk(url) {
    if (!url || typeof url !== 'string' || url.trim().length < 4) {
        return {
            ...ShieldResponse(0, 'Low Risk', [], ['No URL provided — nothing to analyze.']),
            riskLevel: 'LOW RISK',
            verdict: 'Safe',
            detectedSignals: [],
            trustSignals: [],
        };
    }

    const cleanUrl = url.trim();
    let healthScore = 100;          // Start at full health
    const deductions = [];           // Deduction log (rule names + points)
    const reasons = [];           // Human-readable reasoning log
    const trustSignals = [];

    // ── Parse URL safely ──────────────────────────────────────────
    let parsed;
    let hostname = '';
    let tld = '';
    let isHttps = false;

    try {
        const fullUrl = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;
        parsed = new URL(fullUrl);
        hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        const parts = hostname.split('.');
        tld = parts[parts.length - 1] || '';
        isHttps = parsed.protocol === 'https:';
    } catch (_) {
        // Malformed URL — heavy penalty
        healthScore -= 40;
        deductions.push('−40: Malformed / unparseable URL');
        reasons.push('−40 for malformed URL — could not parse hostname or protocol.');
    }

    // ── Rule 1: SSL Check (−40 if https missing) ──────────────────
    if (!isHttps) {
        healthScore -= 40;
        deductions.push('−40: Missing SSL (HTTP only)');
        reasons.push('−40 for missing SSL — URL uses HTTP instead of HTTPS, data is not encrypted.');
    } else {
        trustSignals.push('✔ HTTPS secure connection present');
    }

    // ── Rule 2: Domain Trust — SAFE_LIST check (−20 if not in list)
    if (hostname) {
        if (isInSafeList(hostname)) {
            trustSignals.push(`✔ Domain "${hostname}" is in the verified Safe List`);
        } else {
            healthScore -= 20;
            deductions.push(`−20: Domain "${hostname}" not in Safe List`);
            reasons.push(`−20 for untrusted domain — "${hostname}" is not a verified safe domain.`);
        }
    }

    // ── Rule 3: Suspicious TLD (−30) ─────────────────────────────
    if (tld && SUSPICIOUS_TLDS.has(tld.toLowerCase())) {
        healthScore -= 30;
        deductions.push(`−30: Suspicious TLD (.${tld})`);
        reasons.push(`−30 for suspicious TLD — ".${tld}" is commonly used in phishing and spam domains.`);
    }

    // ── Rule 4: URL Shortener (−25) ──────────────────────────────
    const shortenerMatch = URL_SHORTENERS.has(hostname) ||
        Array.from(URL_SHORTENERS).some(s => hostname === s);
    if (shortenerMatch) {
        healthScore -= 25;
        deductions.push(`−25: URL shortener detected (${hostname})`);
        reasons.push(`−25 for URL shortener — "${hostname}" hides the real destination URL, a common deception tactic.`);
    }

    // ── Rule 5: Entropy Check — random/gibberish strings (−15) ───
    if (hasHighEntropy(cleanUrl)) {
        healthScore -= 15;
        deductions.push('−15: High entropy / random-looking string in URL');
        reasons.push('−15 for high entropy — URL contains random-looking strings or gibberish (e.g., "asdf123-job"), typical of generated phishing links.');
    }

    // ── Bonus Rule: IP address instead of domain (−35) ───────────
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        healthScore -= 35;
        deductions.push('−35: Raw IP address used instead of domain');
        reasons.push('−35 for IP address URL — legitimate sites use domain names, not raw IP addresses.');
    }

    // ── Bonus Rule: Executable file extension (−40) ───────────────
    if (/\.(exe|bat|cmd|scr|vbs|jar|apk)$/i.test(cleanUrl)) {
        healthScore -= 40;
        deductions.push('−40: Direct link to executable file');
        reasons.push('−40 for executable file link — URL points directly to a potentially malicious executable.');
    }

    // ── Bonus Rule: Brand + phishing keyword spoof (−30) ─────────
    if (/(?:microsoft|google|amazon|apple|paypal|facebook|hdfc|sbi|icici|axis)[-_.](?:careers?|jobs?|hiring|portal|verify|account|login|secure|update|offer)/i.test(hostname)) {
        healthScore -= 30;
        deductions.push('−30: Brand impersonation in domain name');
        reasons.push('−30 for brand impersonation — domain mimics a known brand combined with a phishing keyword (e.g., microsoft-verify.xyz).');
    }

    // ── Bonus Rule: Phishing path keywords (−25) ─────────────────
    const pathString = parsed ? (parsed.pathname + parsed.search) : cleanUrl;
    if (/verify.*account|account.*confirm|suspended.*account|prize.*winner|free.*money|claim-now/i.test(pathString)) {
        healthScore -= 25;
        deductions.push('−25: Phishing keywords in URL path');
        reasons.push('−25 for phishing path keywords — URL path contains phrases like "verify-account" or "claim-now" typical of scam pages.');
    }

    // ── Bonus Rule: Heavy URL encoding (−20) ─────────────────────
    if (/%[0-9a-f]{2}%[0-9a-f]{2}%[0-9a-f]{2}/i.test(cleanUrl)) {
        healthScore -= 20;
        deductions.push('−20: Heavy URL encoding / obfuscation');
        reasons.push('−20 for heavy URL encoding — excessive %XX encoding is used to obfuscate malicious content.');
    }

    // ── Bonus Rule: Excessive hyphens in domain (−15) ────────────
    if ((hostname.match(/-/g) || []).length >= 3) {
        healthScore -= 15;
        deductions.push('−15: Excessive hyphens in domain name (≥3)');
        reasons.push('−15 for excessive hyphens — domains with 3+ hyphens (e.g., "quick-jobs-apply-now.com") are commonly auto-generated for scams.');
    }

    // ── WhatsApp / Telegram links (−20) ──────────────────────────
    if (/whatsapp\.com\/invite|chat\.whatsapp|t\.me\/|telegram\.me/i.test(cleanUrl)) {
        healthScore -= 20;
        deductions.push('−20: WhatsApp or Telegram group link');
        reasons.push('−20 for messaging platform link — direct group links on WhatsApp/Telegram are frequently used in job scams.');
    }

    // ══════════════════════════════════════════════════════════════
    //  MID-RISK GREY AREA — 5-Rule Classification System
    //  Applied AFTER all hard-deduction rules above.
    //  Each rule that fires: deducts −10 health and records the rule.
    //  The fired rule labels are included in detectedSignals AND
    //  the first triggered rule is surfaced as `midRiskRule`.
    // ══════════════════════════════════════════════════════════════

    const midRiskRulesTriggered = [];

    // ── MID-RISK Rule 1: Platform Mismatch (Job Boards & Forms) ──
    // Fires when the URL is a generic form/survey platform OR a public
    // job aggregator — the platform is safe but the specific job poster
    // / form creator is unverified.
    if (hostname) {
        const isGenericFormPlatform = GENERIC_FORM_PLATFORMS.some(
            p => hostname === p || hostname.endsWith('.' + p)
        );
        const isJobAggregator = PUBLIC_JOB_AGGREGATORS.some(
            p => hostname === p || hostname.endsWith('.' + p)
        );

        if (isGenericFormPlatform) {
            healthScore -= 10;
            const label = '[MID-RISK Rule 1 — Platform Mismatch] Generic form/survey platform used for hiring (Google Forms / Typeform / Airtable / Notion). Platform is legitimate but the poster is unverified — official companies use proper ATS systems.';
            deductions.push(label);
            reasons.push(`−10 for ${label}`);
            midRiskRulesTriggered.push({ rule: 1, category: 'Platform Mismatch — Generic Form Platform', label });
        } else if (isJobAggregator) {
            // Job aggregators are safe platforms but the specific recruiter may not be verified.
            // Only flag if there are OTHER suspicious signals already — an isolated Naukri link is fine.
            // We flag when the overall risk score (pre mid-risk) is already >0 (other deductions present).
            if (healthScore < 100) {
                const label = '[MID-RISK Rule 1 — Platform Mismatch] Public job aggregator (Naukri / Indeed / Monster). Platform is trustworthy, but the specific job poster and their identity remain unverified.';
                deductions.push(label);
                reasons.push(`Noted (no health penalty) — ${label}`);
                midRiskRulesTriggered.push({ rule: 1, category: 'Platform Mismatch — Public Job Aggregator', label });
            }
        }
    }

    // ── MID-RISK Rule 2: Brand Variation / Typosquatting ─────────
    // Fires when the hostname contains a known brand name root but does
    // NOT exactly match the official corporate domain for that brand.
    // Example: "amazon-jobs-india.in" contains "amazon" but is not amazon.com.
    if (hostname) {
        const alreadySpoofFlagged = deductions.some(d => d.includes('Brand impersonation'));
        if (!alreadySpoofFlagged) {
            const brandMatch = KNOWN_BRAND_ROOTS.find(brand => {
                // hostname must contain the brand root as a distinct segment (not just substring)
                return new RegExp(`(?:^|[\\-._])${brand}(?:[\\-._]|$)`, 'i').test(hostname);
            });
            if (brandMatch) {
                // Check if it's on the official domain list
                const isOfficial = OFFICIAL_BRAND_DOMAINS.has(hostname) ||
                    Array.from(OFFICIAL_BRAND_DOMAINS).some(od => hostname.endsWith('.' + od) || hostname === od);
                if (!isOfficial) {
                    healthScore -= 10;
                    const label = `[MID-RISK Rule 2 — Brand Variation / Typosquatting] Hostname "${hostname}" contains the brand name "${brandMatch}" but does NOT match the official corporate domain. Possible typosquat or unofficial hiring page.`;
                    deductions.push(label);
                    reasons.push(`−10 for ${label}`);
                    midRiskRulesTriggered.push({ rule: 2, category: 'Brand Variation / Typosquatting', label });
                }
            }
        }
    }

    // ── MID-RISK Rule 3: Third-Party ATS Re-direct (Unknown Startup)
    // Fires when the URL is on a legitimate ATS platform (Lever, Greenhouse,
    // Workday, etc.) but the company being hired for appears small / unknown.
    // We detect this by checking: ATS hostname present AND the company
    // sub-path / subdomain is NOT a known major brand.
    if (hostname) {
        const isOnATSPlatform = THIRD_PARTY_ATS_ROOTS.some(
            ats => hostname === ats || hostname.endsWith('.' + ats)
        );
        if (isOnATSPlatform && parsed) {
            // Extract the company slug from the path (e.g. /companyname/) or subdomain
            const pathCompanySlug = (parsed.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
            const subdomainCompany = hostname.split('.')[0].toLowerCase();
            const companySlug = subdomainCompany !== hostname.split('.').slice(1).join('.')
                ? subdomainCompany : pathCompanySlug;

            // Check if the company slug is a known major brand
            const isKnownBrand = KNOWN_BRAND_ROOTS.some(brand =>
                companySlug.includes(brand)
            );

            if (!isKnownBrand && companySlug && companySlug.length > 2) {
                const label = `[MID-RISK Rule 3 — Third-Party ATS Re-direct] URL uses a legitimate hiring platform (${hostname}) but the company being hired for ("${companySlug}") is unknown or unverified. Verify the company independently before applying.`;
                deductions.push(label);
                // No health deduction — ATS platforms are legitimate infrastructure.
                // We add this as an informational mid-risk signal only.
                reasons.push(`Noted (no health penalty) — ${label}`);
                midRiskRulesTriggered.push({ rule: 3, category: 'Third-Party ATS Re-direct (Unknown Company)', label });
            }
        }
    }

    // ── MID-RISK Rule 4: Semi-Professional URL Shortener ─────────
    // Fires when a URL shortener is detected. The hard deduction
    // (−25) already fires above (Rule 4 in the original deduction block).
    // This adds an ADDITIONAL mid-risk classification label to make the
    // reason explicit: "professional-looking context but destination hidden."
    if (URL_SHORTENERS.has(hostname)) {
        const label = '[MID-RISK Rule 4 — Semi-Professional Shortener] Shortened URL (bit.ly / tinyurl / t.co) detected. Even when shared in a professional context (e.g. a LinkedIn message), the real destination is hidden. Expand the short link before clicking.';
        // Deduction already applied above (−25). Only add the mid-risk label.
        midRiskRulesTriggered.push({ rule: 4, category: 'Semi-Professional URL Shortener', label });
        // Record the label in deductions for UI display
        if (!deductions.some(d => d.includes('MID-RISK Rule 4'))) {
            deductions.push(label);
            reasons.push(`Context note — ${label}`);
        }
    }

    // ── MID-RISK Rule 5: Obscure TLD Without Malicious Keywords ──
    // Fires when:
    //   (a) TLD is in the OBSCURE_TLDS set, AND
    //   (b) The URL does NOT contain phishing/malicious keywords
    // If phishing keywords ARE present, the hard SUSPICIOUS_TLDS
    // deduction (−30) would have already fired, so this rule only
    // catches the "grey zone" — non-standard TLD but benign content.
    if (tld && OBSCURE_TLDS.has(tld.toLowerCase()) && !SUSPICIOUS_TLDS.has(tld.toLowerCase())) {
        const hasPhishingKeywords = PHISHING_KEYWORDS_RE.test(cleanUrl);
        if (!hasPhishingKeywords) {
            healthScore -= 10;
            const label = `[MID-RISK Rule 5 — Obscure TLD Without Malicious Keywords] Domain uses ".${tld}" — a non-standard extension that lacks established trust. No phishing keywords detected in the URL, but the TLD itself reduces confidence. Verify the site independently.`;
            deductions.push(label);
            reasons.push(`−10 for ${label}`);
            midRiskRulesTriggered.push({ rule: 5, category: `Obscure TLD (.${tld}) Without Malicious Keywords`, label });
        }
    }

    // ══════════════════════════════════════════════════════════════
    // ZERO-TRUST LINK RULES — override / amplify existing scoring
    // Each rule records a CyberHead Verdict explaining WHY it fired
    // ══════════════════════════════════════════════════════════════
    const ztLinkVerdicts = [];

    // ── ZT-L1: Obfuscation Penalty ────────────────────────────────
    // Shortener + any redirection hop chain = destination fully masked
    if (URL_SHORTENERS.has(hostname)) {
        const visibleHops = (cleanUrl.match(/https?:\/\//g) || []).length;
        const penalty = visibleHops > 1 ? 55 : 30;
        healthScore -= penalty;
        const ztV = `[ZERO-TRUST — Obfuscation Penalty] "${hostname}" is a URL shortener with ${visibleHops} visible redirect layer(s). The actual destination is completely hidden — no way to verify the endpoint without clicking. −${penalty} health. Risk: HIGH.`;
        deductions.push(ztV);
        reasons.push(ztV);
        ztLinkVerdicts.push(ztV);
    }

    // ── ZT-L2: Hop Gravity ────────────────────────────────────────
    // Count nested redirect URLs in query parameters. Exponential trust decay.
    // 1 hop = Elevated, 2 hops = High, 3+ hops = CRITICAL hard-floor
    let ztHopCount = 0;
    try {
        if (parsed) {
            const qVals = Array.from(parsed.searchParams.values());
            ztHopCount = qVals.filter(v => /^https?:\/\//i.test(v)).length;
        }
        if (/https?%3A%2F%2F/i.test(cleanUrl)) ztHopCount += 1;
    } catch (_) { /* ignore */ }

    if (ztHopCount >= 1) {
        const hopPenalty = ztHopCount === 1 ? 10 : ztHopCount === 2 ? 25 : 45;
        const hopLevel   = ztHopCount === 1 ? 'ELEVATED' : ztHopCount === 2 ? 'HIGH' : 'CRITICAL';
        healthScore -= hopPenalty;
        const ztV = `[ZERO-TRUST — Hop Gravity] ${ztHopCount} redirect destination(s) embedded in URL parameters — ${hopLevel}. Exponential trust decay: each hop doubles the probability of obfuscated malware delivery. −${hopPenalty} health applied.`;
        deductions.push(ztV);
        reasons.push(ztV);
        ztLinkVerdicts.push(ztV);
        if (ztHopCount >= 3 && healthScore > 25) {
            healthScore = 25;
            reasons.push('[ZT Hop Gravity Hard-Floor] 3+ hops → health capped at 25 (risk ≥ 75, CRITICAL guaranteed).');
        }
    }

    // ── ZT-L3: Bypass Check ───────────────────────────────────────
    // Generic proxy / redirect services used as laundering layers
    const BYPASS_HOSTS = new Set(['httpbin.org','httpbin.io','redirect.me','redirect.io','href.li','3.ly','snipurl.com','b23.ru']);
    const isGoogleRedirectWrapper = (hostname === 'google.com' || hostname.endsWith('.google.com')) &&
        parsed && (parsed.pathname.startsWith('/url') || parsed.searchParams.has('q') || parsed.searchParams.has('url'));
    const isBypassHost = BYPASS_HOSTS.has(hostname);

    if (isBypassHost || isGoogleRedirectWrapper) {
        healthScore -= 50;
        const proxyName = isGoogleRedirectWrapper ? 'google.com/url (redirect wrapper)' : hostname;
        const ztV = `[ZERO-TRUST — Bypass Check] URL routes through "${proxyName}" as an intermediate redirect/proxy layer. This technique bypasses URL scanners and makes phishing appear legitimate. −50 health. Risk: CRITICAL.`;
        deductions.push(ztV);
        reasons.push(ztV);
        ztLinkVerdicts.push(ztV);
        if (healthScore > 20) {
            healthScore = 20;
            reasons.push('[ZT Bypass Hard-Floor] Proxy bypass detected → health capped at 20 (risk ≥ 80, CRITICAL).');
        }
    }

    // ── Clamp health score and compute risk ───────────────────────
    healthScore = clamp(healthScore, 0, 100);
    const riskScore = 100 - healthScore;           // Risk Score = 100 − Health

    // ── Category ──────────────────────────────────────────────────
    let category, riskLevel, verdict;
    if (riskScore <= 15) {
        category = 'Low Risk';
        riskLevel = 'LOW RISK';
        verdict = 'Safe';
    } else if (riskScore <= 50) {
        category = 'Mid Risk';
        riskLevel = 'MID RISK';
        verdict = 'Suspicious';
    } else {
        category = 'High Risk';
        riskLevel = 'HIGH RISK';
        verdict = 'High Risk';
    }

    // ── Add overall reasoning summary ─────────────────────────────
    if (deductions.length === 0) {
        reasons.unshift(`Health Score: 100/100 — No deductions applied. URL appears legitimate.`);
    } else {
        const totalDeducted = 100 - healthScore;
        reasons.unshift(`Health Score: ${healthScore}/100 — ${totalDeducted} points deducted across ${deductions.length} rule(s). Risk Score = ${riskScore}.`);
    }

    // ── Build MID-RISK summary (first triggered rule wins the label) ─
    const primaryMidRiskRule = midRiskRulesTriggered.length > 0 ? midRiskRulesTriggered[0] : null;

    // If ONLY mid-risk rules fired (no hard deductions) and riskScore
    // would still be Low Risk, bump category to Mid Risk so the grey
    // area classification is surfaced properly.
    if (midRiskRulesTriggered.length > 0 && riskLevel === 'LOW RISK') {
        const deductionPenalties = deductions.filter(d => d.startsWith('−') && !d.includes('MID-RISK'));
        if (deductionPenalties.length === 0) {
            // Only mid-risk signals — override to Mid Risk for grey area
            category = 'Mid Risk';
            riskLevel = 'MID RISK';
            verdict = 'Suspicious / Needs Verification';
        }
    }

    // Override verdict text when mid-risk rules fired alongside hard rules
    if (midRiskRulesTriggered.length > 0 && riskLevel === 'MID RISK') {
        verdict = 'Suspicious / Needs Verification';
    }

    const response = ShieldResponse(riskScore, category, deductions, reasons);
    return {
        ...response,
        riskLevel,
        verdict,
        healthScore,
        detectedSignals: deductions,
        trustSignals,
        // MID-RISK classification details
        midRiskRules: midRiskRulesTriggered,           // all triggered mid-risk rules
        midRiskRule: primaryMidRiskRule                // first (primary) triggered rule
            ? `Rule ${primaryMidRiskRule.rule}: ${primaryMidRiskRule.category}`
            : null,
        midRiskCategory: primaryMidRiskRule?.category ?? null,
        isMidRiskGreyArea: midRiskRulesTriggered.length > 0,
        // Legacy compat
        explanation: reasons,
    };
}


// ── MODULE 2: JOB ANALYZER ───────────────────────────────────────────────
// adds up risk points for each scam signal found in the job text
// groups: A = hard scam signals (crypto, telegram, no interview)
//         B = fee scam signals (security deposit, registration fee)
//         C = mid risk signals (unrealistic salary, urgent language)
// multiplier kicks in when Group A signals are present - pushes score way up
// trust signals (company website, proper process) reduce the final score


/** Helper: whole-word token match (case-insensitive) */
function hasToken(text, tokens) {
    return tokens.some(token => {
        const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        return new RegExp(`\\b${esc}\\b`, 'i').test(text);
    });
}

/** Helper: returns matched subset of tokens */
function matchedTokens(text, tokens) {
    return tokens.filter(token => {
        const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        return new RegExp(`\\b${esc}\\b`, 'i').test(text);
    });
}

// ── GROUP A: Hard-Stop — Phishing / Identity Theft / Crypto / IM ──────
// HIGHEST priority. Any match activates the Scam Multiplier (×1.5 or ×1.9).
// ONLY digital phishing channels belong here — not generic gmail contacts.
// Base weight: 55 pts each.  Group cap: 55.
const JOB_GROUP_A_HARDSTOP = [
    {
        pattern: /\bcrypto\b|\bbitcoin\b|\bethereum\b|\bdigital\s*asset/i,
        label: 'Cryptocurrency / Digital Asset payment demanded', weight: 55
    },
    {
        pattern: /telegram\s*(?:only|contact|us|group|channel|me|:)|t\.me\//i,
        label: 'Telegram as official contact / hiring channel', weight: 55
    },
    {
        pattern: /whatsapp\s*(?:only|hiring|:)|chat\.whatsapp/i,
        label: 'WhatsApp-only hiring (no official channel)', weight: 55
    },
    {
        pattern: /\bno\s*interview\b/i,
        label: 'No Interview required (automatic selection)', weight: 55
    },
    {
        pattern: /\botp\b/i,
        label: 'OTP requested (phishing signal)', weight: 55
    },
    {
        pattern: /\b(aadhaar|aadhar)\b/i,
        label: 'Aadhaar / Government ID requested', weight: 55
    },
    {
        pattern: /\bpan\s*card\b/i,
        label: 'PAN Card requested', weight: 55
    },
    {
        pattern: /\bssn\b|\bsocial\s*security\b/i,
        label: 'SSN / Social Security Number requested', weight: 55
    },
    {
        pattern: /bank\s*(details|account|transfer)/i,
        label: 'Bank details requested', weight: 55
    },
    {
        pattern: /guaranteed\s*(job|selection|hiring|income)/i,
        label: 'Guaranteed Job / Selection claim', weight: 55
    },
    {
        pattern: /offer\s*letter\s*(fee|charge|payment)/i,
        label: 'Offer Letter Fee demanded', weight: 55
    },
    {
        pattern: /interview\s*(fee|charge|payment)/i,
        label: 'Interview Fee demanded from candidate', weight: 55
    },
];

// ── GROUP B: Fee Scam — Suspicious contacts + Deposits / charges before joining ─────────────
// High risk, but WITHOUT Group A these don't trigger the multiplier.
// Fee-only + gmail-contact scams land at ~60–75, not 95+. Base: 40 pts each. Cap: 40.
// NOTE: @gmail as contact is Group B, not A — only Telegram/Crypto/NoInterview trigger multiplier.
const JOB_GROUP_B_FEE_SCAM = [
    {
        // Suspicious contact email is a +30 red flag per strict calibration spec
        pattern: /@gmail\.com|@yahoo\.com|@hotmail\.com|@outlook\.com/i,
        label: '@Gmail/Yahoo used as company\'s official contact email', weight: 30
    },
    {
        // Security Deposit: strict +35 — a deposit request MUST land in MID/HIGH RISK
        pattern: /security\s*deposit/i,
        label: 'Security Deposit demanded', weight: 35
    },
    {
        pattern: /caution\s*(money|fee|deposit)/i,
        label: 'Caution money demanded', weight: 40
    },
    {
        pattern: /registration\s*fee/i,
        label: 'Registration Fee required', weight: 40
    },
    {
        pattern: /processing\s*fee/i,
        label: 'Processing / Application Fee required', weight: 40
    },
    {
        pattern: /activation\s*(fee|charge|amount|cost)/i,
        label: 'Activation Fee required', weight: 40
    },
    {
        pattern: /upfront\s*(fee|payment|amount|charge)/i,
        label: 'Upfront payment required', weight: 40
    },
    {
        pattern: /training\s*(kit|material|fee|cost)/i,
        label: 'Payment for Training Kit / Equipment required', weight: 40
    },
    {
        pattern: /laptop\s*(charge|fee|cost|deposit)/i,
        label: 'Laptop / Device Charge demanded', weight: 40
    },
    {
        pattern: /pay\s*before\s*(join|start|onboard)/i,
        label: 'Payment required before joining', weight: 40
    },
    {
        pattern: /refundable\s*(deposit|fee|money|security)\b/i,
        label: 'Refundable Deposit language (classic scam tactic)', weight: 40
    },
    {
        pattern: /courier\s*(fee|charge|cost)/i,
        label: 'Courier Fee demanded (kit/device scam)', weight: 40
    },
];

// ── GROUP C: Mid-Risk ── Suspicious but not hard proof ────────────────
// Each fires at base 20. Group cap: 20.
const JOB_GROUP_C_MID_RISK = [
    {
        pattern: /no\s*website|no\s*company\s*website/i,
        label: 'No official website mentioned', weight: 20
    },
    {
        pattern: /urgent(?:ly)?\s*(hiring|required|opening|vacancy)/i,
        label: 'Urgent/ASAP hiring language', weight: 20
    },
    {
        pattern: /\basap\b/i,
        label: 'ASAP urgency keyword', weight: 20
    },
    {
        pattern: /work\s*from\s*home.{0,60}(?:per\s*day|daily|₹|rs)/i,
        label: 'Work-from-home + per-day earnings claim', weight: 20
    },
    {
        pattern: /fresher.{0,50}(?:₹|rs\.?\s*)[\d,]{4,}/i,
        label: 'Unrealistically high pay for fresher', weight: 20
    },
    {
        pattern: /mlm|pyramid\s*scheme|network\s*marketing/i,
        label: 'MLM / Pyramid scheme indicator', weight: 20
    },
    {
        pattern: /@(?:rediffmail|consultantmail|yopmail|mail\.com)/i,
        label: 'Disposable / suspicious email domain', weight: 20
    },
    {
        pattern: /earn\s*(?:upto?|up\s*to)?\s*(?:₹|rs\.?\s*)[\d,]{5,}/i,
        label: 'Unrealistic earning promise (₹ amount)', weight: 20
    },
];

// ── SUPPLEMENTARY: Pressure / formatting red flags ─────────────────────
// Low-weight bonus signals. Cap: 5 total.
const JOB_SUPPLEMENTARY = [
    {
        pattern: /apply\s*now.{0,30}(?:limited|hurry|urgent|today)/i,
        label: '"Apply Now" + urgency combo', weight: 5
    },
    {
        pattern: /[A-Z]{4,}\s+[A-Z]{4,}/,
        label: 'Multiple ALL-CAPS words (pressure language)', weight: 5
    },
    {
        pattern: /!{2,}/,
        label: 'Multiple exclamation marks', weight: 5
    },
    {
        pattern: /\bjoin\s*today\b|\bstart\s*today\b/i,
        label: '"Join Today" pressure language', weight: 5
    },
    {
        pattern: /\bpart[\s-]?time\b.{0,40}\b(?:earn|income|salary|₹)\b/i,
        label: 'Part-time earning promise', weight: 5
    },
    {
        pattern: /limited\s*(?:seats?|openings?|slots?|positions?)/i,
        label: 'Limited seats / scarcity pressure', weight: 5
    },
    {
        pattern: /worldwide\s*hiring|global\s*hiring/i,
        label: 'Worldwide / global hiring (no formal process)', weight: 5
    },
    {
        pattern: /google\s*form|bit\.ly|tinyurl/i,
        label: 'Google Form or shortened URL in job post', weight: 5
    },
    {
        pattern: /payment\s*screenshot/i,
        label: 'Payment screenshot requested', weight: 5
    },
];

// ── TRUST SIGNALS (reduce final score, floor 0) ────────────────────────
const JOB_TRUST_SIGNALS = [
    {
        pattern: /\b(?:pvt\.?\s*ltd|ltd\.?|limited|inc\.?)\b/i,
        label: 'Registered company name (Pvt Ltd / Ltd)', weight: -15
    },
    {
        pattern: /@(?!gmail|yahoo|hotmail|outlook)[a-z0-9.\-]+\.[a-z]{2,}/i,
        label: 'Official corporate domain email', weight: -18
    },
    {
        pattern: /₹\s*(?:[2-9]\d|[1-9]\d{2})\s*(?:lpa|lakhs?|l\.p\.a)/i,
        label: 'Realistic salary range (2–9 LPA)', weight: -14
    },
    {
        pattern: /qualifications?[\s\S]{10,300}(?:bachelor|masters?|degree|diploma)/i,
        label: 'Detailed qualifications section', weight: -10
    },
    {
        pattern: /\bno\s*(?:fee|charge|payment|cost)\b/i,
        label: 'Explicit "no fee" statement', weight: -16
    },
    {
        pattern: /\b(?:infosys|wipro|tcs|accenture|deloitte|cognizant|ibm|amazon|microsoft|capgemini|hcl)\b/i,
        label: 'Reputable company name detected', weight: -15
    },
    {
        pattern: /offer\s*letter\s*after\s*(?:interview|selection)/i,
        label: 'Offer letter issued post-interview', weight: -10
    },
    {
        pattern: /apply\s*(?:on|via|through)(?:\s+our\s+)?(?:website|portal|careers|link)/i,
        label: 'Official application process mentioned', weight: -11
    },
    {
        pattern: /(?:benefits?|perks?|insurance|health)[\s\S]{0,100}(?:medical|dental|leave|bonus)/i,
        label: 'Benefits and perks detailed', weight: -9
    },
    {
        pattern: /(?:location|address|office)[\s\S]{0,50}(?:\d+\s+(?:street|rd|avenue|building)|city|state)/i,
        label: 'Specific office location mentioned', weight: -12
    },
];

/**
 * Score a list of indicators against text.
 * Returns { rawScore, matched: [{label, weight}] }
 */
function scoreTier(text, indicators) {
    let rawScore = 0;
    const matched = [];
    for (const { pattern, label, weight } of indicators) {
        if (pattern.test(text)) {
            rawScore += weight;
            matched.push({ label, weight });
        }
    }
    return { rawScore, matched };
}

/**
 * resolveColorClass — Maps a risk score to CSS class + exact hex per spec:
 *   0–15   → .text-green   (#28a745 SAFE)
 *   16–50  → .text-orange  (#fd7e14 MID RISK)
 *   51–100 → .text-red     (#dc3545 HIGH RISK)
 */
function resolveColorClass(score) {
    if (score <= 15) return { colorClass: 'text-green', colorHex: '#28a745' };
    if (score <= 50) return { colorClass: 'text-orange', colorHex: '#fd7e14' };
    return { colorClass: 'text-red', colorHex: '#dc3545' };
}

/**
 * analyzeJobRisk — Point Accumulator + Scam Multiplier.
 *
 * Formula:
 *   Scam_Score = (A_base + B_base + C_base) × multiplier + suppBonus − trust
 *   → Normalized to 0–100 via divisor 120.
 *
 * Multiplier logic:
 *   × 1.9  PhishingContext (any Group A) AND HighEarnClaim → score > 95
 *   × 1.5  PhishingContext alone                           → score > 80
 *   × 1.0  Default (Group B/C fee scam only)               → score ~65–75
 *
 * @param {string} jobText
 * @returns {ShieldResponse & { riskLevel, colorClass, colorHex, detectedFlags, trustSignals, confidence, breakdown }}
 */
function analyzeJobRisk(jobText, emailAddress) {
    if (!jobText || typeof jobText !== 'string' || jobText.trim().length === 0) {
        const empty = ShieldResponse(0, 'Low Risk', [], ['No job text provided.']);
        return {
            ...empty,
            riskLevel: 'LOW RISK', ...resolveColorClass(0),
            detectedFlags: [], trustSignals: [], confidence: 0,
            breakdown: { groupA: 0, groupB: 0, groupC: 0, supp: 0, trust: 0, multiplier: 1.0 },
        };
    }

    const text = jobText;
    const allFlags = [];  // all fired flag labels
    const reasons = [];  // Reasoning Log
    const trustLabels = [];

    // ══════════════════════════════════════════════════════════════
    // STEP 0 — Email Intelligence Analysis (runs before group scoring)
    // ══════════════════════════════════════════════════════════════
    let emailPenalty = 0;

    // Pull email from param; fall back to scanning the job text itself
    const rawEmail = (typeof emailAddress === 'string' && emailAddress.trim())
        ? emailAddress.trim()
        : (jobText.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i) || [])[0] || '';

    if (rawEmail) {
        const emailDomain = rawEmail.split('@').pop()?.toLowerCase() || '';

        // Free / personal email providers → +40 (High Risk)
        const FREE_PROVIDERS = new Set([
            'gmail.com','googlemail.com','yahoo.com','yahoo.co.in','hotmail.com',
            'outlook.com','live.com','protonmail.com','icloud.com','aol.com',
            'rediffmail.com','yopmail.com','mailinator.com',
        ]);
        if (FREE_PROVIDERS.has(emailDomain)) {
            emailPenalty += 40;
            const flag = `[Email Intelligence] Free/personal email provider detected (${rawEmail}). Legitimate corporate HRs never recruit via Gmail, Yahoo, or Outlook. +40 risk.`;
            allFlags.push(flag);
            reasons.push(flag);
        }
        // Typosquatting / suspicious domain — mimics a Tier-1 brand with extra words
        // Pattern: brand root + hyphens/extra words (e.g. tcs-careers-india.com, infosys-hr.net)
        else {
            const TIER1_ROOTS = ['tcs','infosys','wipro','accenture','cognizant','ibm',
                'deloitte','capgemini','hcl','amazon','microsoft','google','apple','meta'];
            const OFFICIAL_ENDINGS = new Set([
                'tcs.com','infosys.com','wipro.com','accenture.com','cognizant.com',
                'ibm.com','deloitte.com','capgemini.com','hcl.com','hcltech.com',
                'amazon.com','microsoft.com','google.com','apple.com','meta.com',
            ]);
            const suspiciousKeywords = /careers?|jobs?|hiring|hr|recruit|india|apply|portal|consult/i;
            const matchedBrand = TIER1_ROOTS.find(b => emailDomain.includes(b));

            if (matchedBrand && !OFFICIAL_ENDINGS.has(emailDomain)) {
                if (suspiciousKeywords.test(emailDomain) || emailDomain.split('.').length > 3 ||
                    /-/.test(emailDomain)) {
                    emailPenalty += 30;
                    const flag = `[Email Intelligence] Typosquatting/suspicious domain detected (${rawEmail}). Domain contains brand name "${matchedBrand}" but is NOT the official corporate email. +30 risk.`;
                    allFlags.push(flag);
                    reasons.push(flag);
                }
            }
            // Standard corporate domain → trust
            else if (emailDomain && !FREE_PROVIDERS.has(emailDomain)) {
                trustLabels.push(`Recruiter email appears to be a standard corporate domain (${rawEmail})`);
                reasons.push(`[Email Intelligence +Trust] ${rawEmail} — domain looks like a legitimate corporate address.`);
            }
        }
    } else {
        // No email at all in job post — mild flag
        reasons.push('[Email Intelligence] No recruiter email found in the posting — unable to validate contact identity.');
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 1 — Score each group (raw base weights, pre-multiplier)
    // ══════════════════════════════════════════════════════════════

    // Group A: Hard-Stop (cap: 55)
    const gA = scoreTier(text, JOB_GROUP_A_HARDSTOP);
    const groupABase = clamp(gA.rawScore, 0, 55);
    // Identity Theft signals: OTP, Aadhaar, PAN, SSN, Bank Details
    const IDENTITY_THEFT_PATTERNS = [
        /\botp\b/i,
        /\b(aadhaar|aadhar)\b/i,
        /\bpan\s*card\b/i,
        /\bssn\b|\bsocial\s*security\b/i,
        /bank\s*(details|account|transfer)/i,
    ];
    const identityTheftDetected = IDENTITY_THEFT_PATTERNS.some(p => p.test(text));

    for (const { label, weight } of gA.matched) {
        allFlags.push(label);
        // Severity: identity theft / crypto / IM = [CRITICAL], others = [HIGH]
        const isCritical = /otp|aadhaar|aadhar|pan\s*card|ssn|social\s*security|bank\s*detail|bank\s*account|bank\s*transfer|crypto|bitcoin|ethereum|digital\s*asset/i.test(label);
        const severity = isCritical ? '[Critical]' : '[High]';
        reasons.push(`+${weight} ${severity} ${label}`);
    }

    // Group B: Fee Scam (cap: 40, but note deposit weight is 35, gmail is 30)
    const gB = scoreTier(text, JOB_GROUP_B_FEE_SCAM);
    const groupBBase = clamp(gB.rawScore, 0, 40);
    for (const { label, weight } of gB.matched) {
        allFlags.push(label);
        // Severity: deposit/registration fee = [High], suspicious contact = [Moderate]
        const isHigh = /deposit|caution\s*money|registration\s*fee|upfront|activation|pay\s*before|training\s*kit|laptop\s*charge|courier/i.test(label);
        const severity = isHigh ? '[High]' : '[Moderate]';
        reasons.push(`+${weight} ${severity} ${label}`);
    }

    // Group C: Mid-Risk (cap: 20)
    const gC = scoreTier(text, JOB_GROUP_C_MID_RISK);
    const groupCBase = clamp(gC.rawScore, 0, 20);
    for (const { label, weight } of gC.matched) {
        allFlags.push(label);
        reasons.push(`+${weight} [Moderate] ${label}`);
    }

    // Supplementary pressure flags (cap: 5)
    const gS = scoreTier(text, JOB_SUPPLEMENTARY);
    const suppBonus = clamp(gS.rawScore, 0, 5);
    for (const { label, weight } of gS.matched) {
        allFlags.push(label);
        reasons.push(`+${weight} [Low] ${label}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 2 — Determine Scam Multiplier
    // ══════════════════════════════════════════════════════════════

    // PhishingContext: any Group A hard-stop signal fired
    const phishingContext = gA.matched.length > 0;

    // HighEarnClaim: unrealistic earnings OR activation fee in same post
    // Matches patterns like: "Earn ₹80,000", "₹1.5L", "activation fee"
    const highEarnClaim =
        /earn\s*(?:upto?|up\s*to)?\s*(?:₹|rs\.?\s*)(?:[5-9]\d{3}|[1-9]\d{4,})/i.test(text) ||
        /(?:₹|rs\.?\s*)(?:[5-9]\d{3}|[1-9]\d{4,}(?:\s*[-–]\s*[1-9]\d{4,})?)/i.test(text) ||
        /activation\s*(fee|charge|amount)/i.test(text);

    let multiplier = 1.0;
    let multiplierLabel = 'No multiplier ×1.0 — fee-only scam (Group B/C), no phishing context';

    if (phishingContext && highEarnClaim) {
        multiplier = 1.9;
        multiplierLabel =
            'SCAM MULTIPLIER ×1.9 — Phishing/Telegram/Gmail (Group A) + high-earn / activation-fee detected → score guaranteed >95';
    } else if (phishingContext) {
        multiplier = 1.5;
        multiplierLabel =
            'SCAM MULTIPLIER ×1.5 — Phishing context confirmed (Telegram / Gmail / Crypto / No-Interview in Group A) → score guaranteed >80';
    }

    reasons.push(multiplierLabel);

    // ══════════════════════════════════════════════════════════════
    // STEP 3 — Trust Signals
    // ══════════════════════════════════════════════════════════════
    const tr = scoreTier(text, JOB_TRUST_SIGNALS);
    let rawTrust = tr.rawScore;

    // ── Trust Signal Conflict Rule ────────────────────────────────
    // If ANY scam flags are detected, trust signals lose 80% of their value.
    // A scammer using a real company name is still a scammer.
    const scamFlagsPresent = allFlags.length > 0;
    if (scamFlagsPresent && rawTrust < 0) {
        rawTrust = rawTrust * 0.20; // retain only 20% → effectively 80% penalty
        reasons.push('[Trust Conflict] Scam flags detected — trust signals penalized by 80% (real company name ≠ safe job)');
    }

    // Hard cap trust at -30 so multiplier cannot be fully negated
    const trustDeduction = clamp(rawTrust, -30, 0);
    for (const { label, weight } of tr.matched) {
        trustLabels.push(label);
        const penalizedWeight = scamFlagsPresent ? Math.round(weight * 0.20) : weight;
        reasons.push(`${penalizedWeight} [Trust Signal${scamFlagsPresent ? ' — 80% penalized' : ''}] ${label}`);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 4 — Point Accumulator formula + Normalization Layer
    //
    //   Scam_Score = (A + B + C) × multiplier + supp − trust
    //
    //   Normalization divisor = 120
    //   Max theoretical raw: (55+40+20)×1.9+5 = 223.5
    //   Divisor 120 maps:
    //     Crypto/Telegram scam (A=55, ×1.9, B=0):  55×1.9 = 104.5 → 87%  → ~87
    //     + HighEarn combo (A=55+earn, ×1.9):       ~115      → ~96  ✓ > 95
    //   Normalization divisor = 90
    //   Calibration (with divisor 90):
    //     Crypto/Telegram + HighEarn (A=55, ×1.9): 55×1.9 = 104.5 → 116% → clamped 100  ✓ > 95
    //     Crypto/Telegram alone (A=55, ×1.5):       55×1.5 = 82.5  → 92%  → ~92           ✓ > 80
    //     Fee+gmail deposit scam (A=0, B=40, C=20): 60×1.0 = 60    → 67%  → ~67           ✓ 60–75
    //     Real job (A=B=C=0):                        0               → 0                   ✓
    // ══════════════════════════════════════════════════════════════
    const NORM_DIVISOR = 90;
    const baseTotal = groupABase + groupBBase + groupCBase;
    const amplified = baseTotal * multiplier;
    const rawScore = amplified + suppBonus + trustDeduction + emailPenalty;
    const normalized = (rawScore / NORM_DIVISOR) * 100;
    let riskScore = clamp(Math.round(normalized), 0, 100);

    // ── Identity Theft Hard-Floor ─────────────────────────────────
    // If Aadhaar / PAN / OTP / Bank Details / SSN detected, score MUST be >= 90
    if (identityTheftDetected && riskScore < 90) {
        reasons.push(`[Critical — Hard-Floor] Identity Theft signal detected → score raised from ${riskScore} to minimum 90`);
        riskScore = 90;
    }

    // ══════════════════════════════════════════════════════════════
    // ZERO-TRUST RULES — Fire AFTER normalization, can override score
    // Each rule writes its CyberHead Verdict into allFlags + reasons
    // ══════════════════════════════════════════════════════════════

    // ── ZT-1: MNC Integrity Check ─────────────────────────────────
    // A Tier-1 company name + any financial pre-condition = scam impersonation
    // Force score to 98 with no exceptions (scammer using TCS/Infosys name)
    const TIER1_CORPS = /\b(tcs|infosys|wipro|accenture|cognizant|ibm|deloitte|capgemini|hcl|amazon|microsoft|google|apple|meta|flipkart|reliance|paytm|razorpay)\b/i;
    const FEE_TRIGGER  = /\b(security\s+deposit|laptop\s+(fee|charge)|refundable|registration\s+fee|processing\s+fee|onboarding\s+(fee|charge))\b/i;
    if (TIER1_CORPS.test(text) && FEE_TRIGGER.test(text)) {
        const corp  = (text.match(TIER1_CORPS) || [''])[0].toUpperCase();
        const fee   = (text.match(FEE_TRIGGER)  || [''])[0];
        const ztVerdict = `[ZERO-TRUST — MNC Integrity Check] "${corp}" detected alongside financial pre-condition ("${fee}"). Legitimate enterprise companies NEVER ask candidates for money. This is an impersonation scam. Score forced to 98.`;
        allFlags.unshift(ztVerdict);
        reasons.push(ztVerdict);
        riskScore = 98;
    }

    // ── ZT-2: Salary-Skill Anomaly ("Dumb Scam" Detector) ────────
    // Low-skill roles (Typing, Data Entry, Liker) offering > ₹30k/month
    // or > $30k/year are statistically impossible — flag as critical
    const DUMB_SCAM_ROLES = /\b(typing\s+job|data\s+entry|facebook\s+liker|instagram\s+liker|social\s+media\s+liker|copy\s+paste\s+job|youtube\s+liker)\b/i;
    const SALARY_RE = /(?:₹|rs\.?\s*|\$\s*)(\d[\d,]*)\s*(?:k|000)?\s*(?:\/|per|a)?\s*(?:month|monthly|pm|mo|year|yr|pa|p\.a|annual)?/i;
    if (DUMB_SCAM_ROLES.test(text)) {
        const salMatch = text.match(SALARY_RE);
        const rawNum   = salMatch ? parseFloat(salMatch[1].replace(/,/g, '')) : 0;
        const threshold = text.includes('$') ? 30000 : 30000; // ₹30k/mo or $30k/yr
        if (rawNum > threshold) {
            const role = (text.match(DUMB_SCAM_ROLES) || ['this role'])[0];
            const ztVerdict = `[ZERO-TRUST — Salary-Skill Anomaly] Low-skill role ("${role}") with salary claim of ${salMatch ? salMatch[0].trim() : rawNum} far exceeds realistic market rate. Statistical probability of legitimacy: near zero. +50 penalty applied.`;
            allFlags.push(ztVerdict);
            reasons.push(ztVerdict);
            riskScore = clamp(riskScore + 50, 0, 100);
        }
    }

    // ── ZT-3: Linguistic Pressure (High-Level Coercion) ───────────
    // Specific coercive phrases that imply ultimatums to extract money fast
    const COERCION_PHRASES = [
        { re: /failure\s+to\s+pay/i,       label: 'Failure to pay' },
        { re: /offer\s+(?:will\s+be\s+)?cancell?ed/i, label: 'Offer cancellation threat' },
        { re: /within\s+24\s+hours?/i,     label: 'Within 24 hours ultimatum' },
        { re: /within\s+48\s+hours?/i,     label: 'Within 48 hours ultimatum' },
        { re: /immediate\s+payment\s+required/i, label: 'Immediate payment required' },
        { re: /pay\s+(?:the\s+)?fee\s+(?:or|else)\s+(?:lose|forfeit)/i, label: 'Pay or forfeit threat' },
    ];
    const firedCoercion = COERCION_PHRASES.filter(c => c.re.test(text));
    if (firedCoercion.length > 0) {
        const labels = firedCoercion.map(c => c.label).join(', ');
        const ztVerdict = `[ZERO-TRUST — Linguistic Pressure] High-level coercion tactic detected: "${labels}". This language is designed to create panic and force rushed financial decisions. +30 penalty applied.`;
        allFlags.push(ztVerdict);
        reasons.push(ztVerdict);
        riskScore = clamp(riskScore + 30, 0, 100);
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 5 — Category, CSS color class, confidence
    // ══════════════════════════════════════════════════════════════
    let category, riskLevel;
    if (riskScore <= 15) {
        category = 'Low Risk';
        riskLevel = 'LOW RISK';
    } else if (riskScore <= 50) {
        category = 'Mid Risk';
        riskLevel = 'MID RISK';
    } else {
        category = 'High Risk';
        riskLevel = 'HIGH RISK';
    }

    const { colorClass, colorHex } = resolveColorClass(riskScore);
    const totalSignals = allFlags.length + trustLabels.length;
    const confidence = clamp(15 + totalSignals * 8, 10, 95);

    // Reasoning preamble
    reasons.unshift(
        `Risk Score: ${riskScore}/100` +
        ` | A=${groupABase} B=${groupBBase} C=${groupCBase}` +
        ` base=${baseTotal} ×${multiplier}` +
        ` amplified=${Math.round(amplified)} supp=+${suppBonus} trust=${trustDeduction}` +
        ` raw=${Math.round(rawScore)} ÷${NORM_DIVISOR}×100 = ${riskScore}`
    );
    if (allFlags.length === 0) {
        reasons.push('No suspicious signals detected. Job appears legitimate.');
    }

    const response = ShieldResponse(riskScore, category, allFlags, reasons);
    return {
        ...response,
        riskLevel,
        riskScore: response.score,
        colorClass,               // .text-green | .text-orange | .text-red
        colorHex,                 // hex color for inline-style fallback
        detectedFlags: allFlags,
        trustSignals: trustLabels,
        confidence,
        breakdown: {
            groupA: groupABase,
            groupB: groupBBase,
            groupC: groupCBase,
            supp: suppBonus,
            trust: trustDeduction,
            multiplier,
            baseTotal,
            amplified: Math.round(amplified),
            rawScore: Math.round(rawScore),
            normalized: riskScore,
        },
    };
}


/* ═══════════════════════════════════════════════════════════════════════
   § MODULE 3 — RESUME PARSER (Normalized 0–100 Strength Score)
   ═══════════════════════════════════════════════════════════════════════
   Scoring formula (normalized to 0–100):
     • Keyword Match    : 40 points (40%)
     • Action Verbs     : 30 points (30%)
     • ATS Formatting   : 30 points (30%)

   Sub-scoring:
     Keyword Match (40 pts):
       - 6+ tech skills found       → 40 pts
       - 3–5 tech skills            → 25 pts
       - 1–2 tech skills            → 12 pts
       - 0 skills                   → 0 pts

     Action Verbs (30 pts):
       - 5+ action verbs            → 30 pts
       - 3–4 action verbs           → 20 pts
       - 1–2 action verbs           → 10 pts
       - 0 action verbs             → 0 pts

     ATS Formatting (30 pts) — rewarded for structure:
       - Has email                  → +6
       - Has phone                  → +5
       - Has LinkedIn/GitHub        → +5
       - Has Education section      → +5
       - Has Experience section     → +5
       - Word count ≥ 300           → +4

   Suggestions are generated for items scoring below their maximum.
   ═══════════════════════════════════════════════════════════════════════ */

const TECH_SKILLS = [
    'javascript', 'python', 'java', 'react', 'node', 'sql', 'aws',
    'docker', 'git', 'typescript', 'c++', 'angular', 'vue', 'mongodb',
    'postgresql', 'machine learning', 'data science', 'html', 'css',
    'linux', 'kubernetes', 'tensorflow', 'pytorch', 'rust', 'golang',
    'graphql', 'redis', 'elasticsearch', 'kafka', 'spring', 'django',
    'flask', 'express', 'php', 'ruby', 'swift', 'kotlin', 'dart', 'flutter',
];

const ACTION_VERBS = [
    'developed', 'implemented', 'designed', 'architected', 'built',
    'deployed', 'optimized', 'improved', 'led', 'managed', 'created',
    'delivered', 'achieved', 'reduced', 'increased', 'automated',
    'debugged', 'collaborated', 'integrated', 'mentored', 'researched',
    'analyzed', 'launched', 'maintained', 'refactored', 'migrated',
    'coordinated', 'supervised', 'established', 'negotiated',
];

/**
 * analyzeResumeText — Evaluates a resume on a normalized 0–100 strength score.
 *
 * @param {string} resumeText
 * @returns {ShieldResponse & { keywordScore, actionVerbScore, atsScore, suggestions, riskScore, careerStrengthScore }}
 */
function analyzeResumeText(resumeText) {
    if (!resumeText || resumeText.trim().length < 20) {
        return {
            ...ShieldResponse(10, 'Weak', [], ['Resume text is too short to analyze.']),
            keywordScore: 0,
            actionVerbScore: 0,
            atsScore: 0,
            suggestions: ['Provide more resume content — at least 20 characters required.'],
            riskScore: 50,
            careerStrengthScore: 10,
        };
    }

    const lower = resumeText.toLowerCase();
    const words = resumeText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const deductions = [];  // used here as "scoring notes"
    const reasons = [];
    const suggestions = [];

    // ─────────────────────────────────────────────────────────────
    // PILLAR 1: Keyword Match (max 40 pts)
    // ─────────────────────────────────────────────────────────────
    const foundSkills = TECH_SKILLS.filter(s => lower.includes(s));
    let keywordScore;
    if (foundSkills.length >= 6) {
        keywordScore = 40;
        deductions.push(`Keyword Match: ${foundSkills.length} skills found → 40/40 pts`);
        reasons.push(`+40/40 Keyword Match — ${foundSkills.length} technical skills detected: ${foundSkills.slice(0, 6).join(', ')}${foundSkills.length > 6 ? '…' : ''}`);
    } else if (foundSkills.length >= 3) {
        keywordScore = 25;
        deductions.push(`Keyword Match: ${foundSkills.length} skills found → 25/40 pts`);
        reasons.push(`+25/40 Keyword Match — ${foundSkills.length} skills found (${foundSkills.join(', ')}). Aim for 6+ skills.`);
        suggestions.push(`Expand your Skills section to 6+ technologies. Currently found: ${foundSkills.join(', ')}.`);
    } else if (foundSkills.length >= 1) {
        keywordScore = 12;
        deductions.push(`Keyword Match: ${foundSkills.length} skill(s) found → 12/40 pts`);
        reasons.push(`+12/40 Keyword Match — Only ${foundSkills.length} skill(s) found (${foundSkills.join(', ')}). Add more relevant technologies.`);
        suggestions.push('Your Skills section is sparse. List all programming languages, frameworks, and tools you know.');
    } else {
        keywordScore = 0;
        deductions.push('Keyword Match: 0 recognized skills → 0/40 pts');
        reasons.push('+0/40 Keyword Match — No recognizable technical skills detected. Add a dedicated Skills section.');
        suggestions.push('Add a dedicated "Skills" section listing programming languages, frameworks, databases, and tools.');
    }

    // ─────────────────────────────────────────────────────────────
    // PILLAR 2: Action Verbs (max 30 pts)
    // ─────────────────────────────────────────────────────────────
    const foundVerbs = ACTION_VERBS.filter(v => {
        const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`\\b${esc}\\b`, 'i').test(resumeText);
    });
    let actionVerbScore;
    if (foundVerbs.length >= 5) {
        actionVerbScore = 30;
        deductions.push(`Action Verbs: ${foundVerbs.length} verbs found → 30/30 pts`);
        reasons.push(`+30/30 Action Verbs — Strong usage of ${foundVerbs.length} action verbs: ${foundVerbs.slice(0, 5).join(', ')}…`);
    } else if (foundVerbs.length >= 3) {
        actionVerbScore = 20;
        deductions.push(`Action Verbs: ${foundVerbs.length} verbs found → 20/30 pts`);
        reasons.push(`+20/30 Action Verbs — ${foundVerbs.length} action verbs found (${foundVerbs.join(', ')}). Use 5+ for maximum impact.`);
        suggestions.push(`Use more strong action verbs in your bullet points. Found: ${foundVerbs.join(', ')}. Add more like "Architected", "Deployed", "Optimized".`);
    } else if (foundVerbs.length >= 1) {
        actionVerbScore = 10;
        deductions.push(`Action Verbs: ${foundVerbs.length} verbs found → 10/30 pts`);
        reasons.push(`+10/30 Action Verbs — Only ${foundVerbs.length} action verb(s) detected. Start bullet points with strong verbs.`);
        suggestions.push('Start every bullet point with a strong action verb (e.g., "Developed", "Implemented", "Led", "Reduced").');
    } else {
        actionVerbScore = 0;
        deductions.push('Action Verbs: 0 verbs found → 0/30 pts');
        reasons.push('+0/30 Action Verbs — No action verbs detected. Rewrite experience bullets to start with verbs.');
        suggestions.push('Rewrite your job description bullet points to start with action verbs: "Built", "Implemented", "Designed", "Managed".');
    }

    // ─────────────────────────────────────────────────────────────
    // PILLAR 3: ATS Formatting (max 30 pts)
    // ─────────────────────────────────────────────────────────────
    let atsScore = 0;
    const atsNotes = [];

    const hasEmail = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(lower);
    if (hasEmail) { atsScore += 6; atsNotes.push('Email address present (+6)'); }
    else { suggestions.push('Add a professional email address at the top of your resume.'); }

    const hasPhone = /(\+?\d[\d\s\-(). ]{7,}\d)/.test(lower);
    if (hasPhone) { atsScore += 5; atsNotes.push('Phone number present (+5)'); }
    else if (suggestions.length < 4) { suggestions.push('Include a phone number so recruiters can reach you.'); }

    const hasLinkedIn = /linkedin|github/i.test(lower);
    if (hasLinkedIn) { atsScore += 5; atsNotes.push('LinkedIn/GitHub profile present (+5)'); }
    else if (suggestions.length < 4) { suggestions.push('Add your LinkedIn and GitHub profile URLs to boost credibility.'); }

    const hasEducation = /\b(b\.?tech|bca|mca|bachelor|master|mba|ph\.?d|diploma|b\.?sc|m\.?sc|b\.?e\.?|education|qualification|academics?)\b/i.test(lower);
    if (hasEducation) { atsScore += 5; atsNotes.push('Education section detected (+5)'); }
    else if (suggestions.length < 4) { suggestions.push('Add an Education section with your degree, institution, and graduation year.'); }

    const hasExperience = /\b(experience|employment|internship|work\s*history|responsibilities?)\b/i.test(lower);
    if (hasExperience) { atsScore += 5; atsNotes.push('Experience section detected (+5)'); }
    else if (suggestions.length < 4) { suggestions.push('Add a clearly labeled Experience or Work History section.'); }

    if (wordCount >= 300) { atsScore += 4; atsNotes.push(`Word count ${wordCount} (≥300) (+4)`); }
    else { suggestions.push(`Resume is too short (${wordCount} words). Aim for 300–600 words to pass ATS filters.`); }

    deductions.push(`ATS Formatting: ${atsNotes.length} checks passed → ${atsScore}/30 pts`);
    reasons.push(`+${atsScore}/30 ATS Formatting — ${atsNotes.join(', ')}.`);

    // ─────────────────────────────────────────────────────────────
    // Final Normalized Score (0–100)
    // ─────────────────────────────────────────────────────────────
    const finalScore = keywordScore + actionVerbScore + atsScore;  // max = 40+30+30 = 100
    const normalizedScore = clamp(Math.round(finalScore), 0, 100);

    // ── Category ─────────────────────────────────────────────────
    let category;
    if (normalizedScore >= 75) category = 'Excellent';
    else if (normalizedScore >= 50) category = 'Good';
    else if (normalizedScore >= 25) category = 'Fair';
    else category = 'Weak';

    reasons.unshift(
        `Resume Strength Score: ${normalizedScore}/100 — Keyword Match ${keywordScore}/40 + Action Verbs ${actionVerbScore}/30 + ATS Formatting ${atsScore}/30.`
    );

    const response = ShieldResponse(normalizedScore, category, deductions, reasons);
    return {
        ...response,
        keywordScore,
        actionVerbScore,
        atsScore,
        suggestions: suggestions.slice(0, 4),
        // Legacy compat
        riskScore: clamp(100 - normalizedScore, 0, 100), // inverse for ATS "risk"
        careerStrengthScore: normalizedScore,
    };
}


/* ═══════════════════════════════════════════════════════════════════════
   § EXPORTS
   ═══════════════════════════════════════════════════════════════════════ */
module.exports = {
    analyzeJobRisk,
    analyzeLinkRisk,
    analyzeResumeText,
    ShieldResponse,
};


/* ═══════════════════════════════════════════════════════════════════════
   § SELF-TEST  (run: node utils/riskEngine.js)

   Expected thresholds:
     Link:  Low Risk 0–15 | Mid Risk 16–50 | High Risk 51–100
     Job:   Low Risk 0–15 | Mid Risk 16–50 | High Risk 51–100
     Resume: 0–100 strength (higher = better)
   ═══════════════════════════════════════════════════════════════════════ */
if (require.main === module) {
    const SEP = '═'.repeat(65);

    console.log(`\n${SEP}`);
    console.log('  JobShield riskEngine v4.0 — Self Test');
    console.log(`${SEP}\n`);

    // ── Link Tests ───────────────────────────────────────────────
    console.log('── LINK ANALYZER TESTS ──────────────────────────────────────\n');
    const LINK_CASES = [
        {
            label: 'Link 1 — Phishing URL (expect High Risk ≥51)',
            url: 'http://microsoft-career-verify-account.xyz/login?claim=prize',
            expect: '>= 51',
        },
        {
            label: 'Link 2 — Bit.ly shortener (expect Mid Risk 16–50)',
            url: 'https://bit.ly/3fakeJob',
            expect: '16-50',
        },
        {
            label: 'Link 3 — Official LinkedIn (expect Low Risk ≤15)',
            url: 'https://www.linkedin.com/jobs/view/123456789',
            expect: '<= 15',
        },
        {
            label: 'Link 4 — Suspicious TLD (expect Mid–High Risk ≥16)',
            url: 'http://quickjobs-hiring.biz/apply-now',
            expect: '>= 16',
        },
    ];

    for (const tc of LINK_CASES) {
        const r = analyzeLinkRisk(tc.url);
        const [lo, hi] = tc.expect.includes('-') ? tc.expect.split('-').map(Number) : [null, null];
        const pass =
            (tc.expect.startsWith('>=') && r.score >= parseInt(tc.expect.slice(2))) ||
            (tc.expect.startsWith('<=') && r.score <= parseInt(tc.expect.slice(2))) ||
            (lo !== null && r.score >= lo && r.score <= hi);
        console.log(`${pass ? '✅' : '❌'} ${tc.label}`);
        console.log(`   Risk Score : ${r.score}  (expect ${tc.expect})  category: ${r.category}`);
        console.log(`   Health     : ${r.healthScore}/100`);
        console.log(`   Deductions : ${r.deductions.slice(0, 3).join(' | ') || 'none'}`);
        console.log(`   Trust      : ${r.trustSignals.join(' | ') || 'none'}`);
        console.log('   Reasoning Log:');
        r.reasons.forEach(rs => console.log(`     • ${rs}`));
        console.log();
    }

    // ── Job Tests ────────────────────────────────────────────────
    console.log('── JOB ANALYZER TESTS ───────────────────────────────────────\n');
    const JOB_CASES = [
        {
            label: 'Job 1 — Obvious scam (expect High Risk ≥51)',
            expect: '>= 51',
            text: `URGENT HIRING!! No interview needed. Pay security deposit of Rs 5000.
                   WhatsApp only: 9999999999. Guaranteed selection! Bank details required.
                   Send Aadhaar and PAN card. Payment for training kit before joining.`,
        },
        {
            label: 'Job 2 — Mid-risk suspicious (expect Mid Risk 16–50)',
            expect: '16-50',
            text: `Hiring Data Entry — Work from Home. Freshers welcome.
                   Contact: hr.quickjobs@gmail.com. No company website listed.
                   Urgent: Apply ASAP. A small refundable deposit of Rs 299 required.`,
        },
        {
            label: 'Job 3 — Real job (expect Low Risk ≤15)',
            expect: '<= 15',
            text: `TechSolutions Pvt. Ltd. is hiring a Software Engineer (2–4 years).
                   Salary: ₹6–8 LPA. Location: Bangalore, MG Road.
                   Apply via our careers portal at techsolutions.com/careers.
                   No fee required. Offer letter after interview. Benefits: health insurance.
                   Contact: hr@techsolutions.com | +91-80-1234-5678.`,
        },
    ];

    for (const tc of JOB_CASES) {
        const r = analyzeJobRisk(tc.text);
        const [lo, hi] = tc.expect.includes('-') ? tc.expect.split('-').map(Number) : [null, null];
        const pass =
            (tc.expect.startsWith('>=') && r.score >= parseInt(tc.expect.slice(2))) ||
            (tc.expect.startsWith('<=') && r.score <= parseInt(tc.expect.slice(2))) ||
            (lo !== null && r.score >= lo && r.score <= hi);
        console.log(`${pass ? '✅' : '❌'} ${tc.label}`);
        console.log(`   Risk Score : ${r.score}  (expect ${tc.expect})  category: ${r.category}`);
        console.log(`   Breakdown  : Tier1=${r.breakdown.tier1} Tier2=${r.breakdown.tier2} Tier3=${r.breakdown.tier3} Trust=${r.breakdown.trust}`);
        console.log(`   Flags (${r.detectedFlags.length}): ${r.detectedFlags.slice(0, 3).join(' | ') || 'none'}`);
        console.log(`   Trust (${r.trustSignals.length}): ${r.trustSignals.join(' | ') || 'none'}`);
        console.log('   Reasoning Log:');
        r.reasons.forEach(rs => console.log(`     • ${rs}`));
        console.log();
    }

    // ── Resume Tests ─────────────────────────────────────────────
    console.log('── RESUME PARSER TESTS ──────────────────────────────────────\n');
    const RESUME_CASES = [
        {
            label: 'Resume 1 — Strong resume (expect ≥65)',
            expect: '>= 65',
            text: `John Doe | john@gmail.com | +91-99999-99999 | linkedin.com/in/johndoe | github.com/johndoe
                   Education: B.Tech Computer Science, IIT Bombay (2020)
                   Experience: Software Engineer at Acme Corp (2020–Present)
                   - Developed and deployed microservices using Node.js, Docker, Kubernetes.
                   - Implemented REST APIs with Python and Flask, reduced latency by 40%.
                   - Led a team of 5 engineers, architected database schema using PostgreSQL.
                   - Optimized CI/CD pipelines, improved deployment frequency by 3x.
                   Skills: JavaScript, Python, React, Node.js, SQL, AWS, Docker, Git, TypeScript, MongoDB`,
        },
        {
            label: 'Resume 2 — Average resume (expect 30–65)',
            expect: '30-65',
            text: `Jane Smith | jane@yahoo.com
                   Education: BCA from Delhi University
                   Skills: Python, Java, HTML
                   Experience: Internship at XYZ Corp (6 months)
                   Developed web pages using HTML and CSS.`,
        },
        {
            label: 'Resume 3 — Weak resume (expect ≤30)',
            expect: '<= 30',
            text: `I am a hardworking and innovative professional looking for a job.
                   I am passionate, proactive, and dynamic. Please hire me.`,
        },
    ];

    for (const tc of RESUME_CASES) {
        const r = analyzeResumeText(tc.text);
        const [lo, hi] = tc.expect.includes('-') ? tc.expect.split('-').map(Number) : [null, null];
        const pass =
            (tc.expect.startsWith('>=') && r.score >= parseInt(tc.expect.slice(2))) ||
            (tc.expect.startsWith('<=') && r.score <= parseInt(tc.expect.slice(2))) ||
            (lo !== null && r.score >= lo && r.score <= hi);
        console.log(`${pass ? '✅' : '❌'} ${tc.label}`);
        console.log(`   Strength   : ${r.score}/100  (expect ${tc.expect})  category: ${r.category}`);
        console.log(`   Breakdown  : Keywords=${r.keywordScore}/40  Verbs=${r.actionVerbScore}/30  ATS=${r.atsScore}/30`);
        console.log('   Reasoning Log:');
        r.reasons.forEach(rs => console.log(`     • ${rs}`));
        if (r.suggestions.length) {
            console.log('   Suggestions:');
            r.suggestions.forEach(s => console.log(`     → ${s}`));
        }
        console.log();
    }
}
