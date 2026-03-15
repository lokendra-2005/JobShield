'use strict';

// Deep Trace & Bypass Engine — core crawler
// Uses puppeteer-extra + stealth plugin to crawl redirect chains up to 20 hops deep.
// Emits live events via the provided `emit(event, payload)` callback (injected by socket handler).

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_HOPS = 20;
const NAV_TIMEOUT_MS = 20_000;    // max wait per navigation
const INTERACTION_DELAY_MIN = 800;  // ms — min think-time before clicking
const INTERACTION_DELAY_MAX = 2500; // ms — max think-time before clicking
const JS_TIMER_WAIT_MAX = 12_000;   // max we'll wait for a JS countdown timer

// ─── User-Agent pool (real Chrome UAs, mix of platforms) ─────────────────────
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:123.0) Gecko/20100101 Firefox/123.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

// ─── Advance-button keyword list ──────────────────────────────────────────────
// Ordered by priority — first match wins on each hop.
const ADVANCE_KEYWORDS = [
    'skip ad', 'skip ads', 'skip', 'continue', 'proceed', 'get link',
    'get file', 'get download', 'go to link', 'next', 'verify', 'submit',
    'i am not a robot', 'confirm', 'access link', 'download', 'claim',
];

// ─── Known malicious / suspicious TLD lists ───────────────────────────────────
const BAD_TLDS    = ['.xyz', '.tk', '.ml', '.cf', '.ga', '.gq', '.pw', '.top', '.click', '.link', '.win', '.loan', '.download'];
const MEDIUM_TLDS = ['.info', '.biz', '.online', '.site', '.store', '.fun', '.life'];

// ─── Known phishing brand-squatting patterns ──────────────────────────────────
const BRAND_SQUATS = [
    /paypa[l1]/, /faceb[o0]{2}k/, /g[o0]{2}gle/, /micros[o0]ft/, /app[l1]e/,
    /amaz[o0]n/, /[l1]inkedin/, /netf[l1][i1]x/, /inst[a@]gr[a@]m/, /wh[a@]ts[a@]pp/,
];

// Free subdomain / redirect abuse services
const SUSPICIOUS_HOSTS = [
    'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'ow.ly', 'is.gd', 'buff.ly',
    'adf.ly', 'linkvertise.com', 'exe.io', 'bc.vc', 'ouo.io', 'shorte.st',
    'clk.sh', 'za.gl', 'cutt.ly', 'rb.gy', 'shorturl.at', 'bl.ink',
];

// ─── Common overlay/modal selectors to dismiss ────────────────────────────────
const OVERLAY_SELECTORS = [
    '[aria-label="Close"]', 'button.close', '.modal-close', '.popup-close',
    '[class*="cookie"] button', '[id*="accept-cookie"]', '#cookie-accept',
    '.gdpr-accept', '[data-dismiss="modal"]',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = INTERACTION_DELAY_MIN, max = INTERACTION_DELAY_MAX) {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min) + min)));
}

/** Move cursor in a human-like bezier arc before clicking an element */
async function humanClick(page, element) {
    try {
        const box = await element.boundingBox();
        if (!box) { await element.click(); return; }
        // Approximate start as current mouse position (just pick a random edge)
        const startX = Math.random() * 100 + 50;
        const startY = Math.random() * 100 + 50;
        const targetX = box.x + box.width / 2 + (Math.random() * 6 - 3);
        const targetY = box.y + box.height / 2 + (Math.random() * 6 - 3);
        // Simple intermediate waypoints (two-step)
        const midX = (startX + targetX) / 2 + (Math.random() * 80 - 40);
        const midY = (startY + targetY) / 2 + (Math.random() * 80 - 40);
        await page.mouse.move(startX, startY);
        await page.mouse.move(midX, midY, { steps: 15 });
        await page.mouse.move(targetX, targetY, { steps: 20 });
        await page.mouse.click(targetX, targetY);
    } catch {
        // Fallback to direct click if geometry fails
        try { await element.click(); } catch { /* element gone */ }
    }
}

/** Normalise a URL for loop-detection (strip fragment, sort query params) */
function normaliseUrl(raw) {
    try {
        const u = new URL(raw);
        u.hash = '';
        const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
        u.search = new URLSearchParams(params).toString();
        return u.toString().toLowerCase();
    } catch {
        return raw.toLowerCase();
    }
}

/** Quick heuristic risk score for a single URL — no external API */
function assessHopRisk(rawUrl) {
    const signals = [];
    let score = 0;

    let hostname = '';
    let pathname = '';
    try {
        const u = new URL(rawUrl);
        hostname = u.hostname.toLowerCase();
        pathname = u.pathname.toLowerCase();
    } catch {
        return { riskLevel: 'suspicious', score: 55, signals: ['Malformed URL'] };
    }

    // IP address as hostname — very suspicious
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
        score += 40; signals.push('IP address host (no domain)');
    }

    // Known bad TLDs
    const tld = '.' + hostname.split('.').slice(-1)[0];
    if (BAD_TLDS.includes(tld)) { score += 30; signals.push(`High-risk TLD: ${tld}`); }
    else if (MEDIUM_TLDS.includes(tld)) { score += 15; signals.push(`Suspicious TLD: ${tld}`); }

    // Known link shorteners (medium risk — may be legitimate)
    if (SUSPICIOUS_HOSTS.some(h => hostname.includes(h))) {
        score += 10; signals.push('Known URL shortener / redirect service');
    }

    // Brand squatting in hostname
    for (const pattern of BRAND_SQUATS) {
        if (pattern.test(hostname)) {
            score += 45; signals.push(`Possible brand squatting detected: ${hostname}`); break;
        }
    }

    // Long subdomain chains (common in phishing)
    const subdomainCount = hostname.split('.').length - 2;
    if (subdomainCount >= 3) { score += 15; signals.push(`Excessive subdomain depth: ${subdomainCount}`); }

    // Path keywords (data harvesting, login, verify, etc.)
    const dangerPath = /\/(login|signin|verify|confirm|secure|account|update|password|bank|wallet|withdraw)/i;
    if (dangerPath.test(pathname)) { score += 20; signals.push('Sensitive path keyword detected'); }

    // Abnormally long URL
    if (rawUrl.length > 200) { score += 10; signals.push('Abnormally long URL'); }

    // No HTTPS
    if (!rawUrl.startsWith('https://')) { score += 20; signals.push('No HTTPS — plain HTTP connection'); }

    // Determine level
    let riskLevel;
    if (score >= 50) riskLevel = 'malicious';
    else if (score >= 20) riskLevel = 'suspicious';
    else riskLevel = 'clean';

    return { riskLevel, score: Math.min(100, score), signals };
}

/** Try to dismiss common overlays/modals without navigating away */
async function dismissOverlays(page) {
    for (const sel of OVERLAY_SELECTORS) {
        try {
            const el = await page.$(sel);
            if (el) {
                await el.click();
                await randomDelay(300, 700);
            }
        } catch { /* selector not found — fine */ }
    }
}

/**
 * Scan the page for advance-action elements.
 * Returns the element and the matched keyword/label, or null if nothing found.
 */
async function findAdvanceElement(page) {
    // First pass: text-content keyword match across all interactive elements
    const result = await page.evaluateHandle((keywords) => {
        const candidates = [
            ...document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')
        ];
        for (const kw of keywords) {
            for (const el of candidates) {
                const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').toLowerCase().trim();
                if (text.includes(kw)) {
                    // Visible check
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) return el;
                }
            }
        }
        return null;
    }, ADVANCE_KEYWORDS);

    // If evaluateHandle returned a real element (not null JSHandle)
    try {
        const box = await result.boundingBox();
        if (box) return result;
    } catch { /* null handle — no element found */ }

    // Second pass: find the most prominent button by area (heuristic for "big CTA")
    const bigButton = await page.evaluateHandle(() => {
        const buttons = [...document.querySelectorAll('button, a, input[type="submit"]')];
        let best = null, bestArea = 0;
        for (const el of buttons) {
            const rect = el.getBoundingClientRect();
            // Must be in the top 80% of viewport and visible
            if (rect.top > window.innerHeight * 0.8) continue;
            if (rect.width === 0 || rect.height === 0) continue;
            const area = rect.width * rect.height;
            if (area > bestArea && area < 200_000) { // ignore giant full-page overlays
                bestArea = area;
                best = el;
            }
        }
        return best;
    });

    try {
        const box = await bigButton.boundingBox();
        if (box) return bigButton;
    } catch { /* nothing prominent */ }

    return null;
}

/** Check if a JS countdown timer is visible on the page */
async function detectJsTimer(page) {
    return page.evaluate(() => {
        // Look for elements containing digits that look like a countdown
        const all = [...document.querySelectorAll('*')];
        for (const el of all) {
            if (el.children.length > 0) continue; // only leaf nodes
            const text = (el.innerText || '').trim();
            // Pattern: a pure number between 1-99 (countdown seconds)
            if (/^\d{1,2}$/.test(text)) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return true;
            }
        }
        return false;
    });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * runDeepTrace(startUrl, emit)
 *
 * @param {string}   startUrl  - The initial URL to trace
 * @param {Function} emit      - emit(event, payload) — wired to socket.emit by the socket handler
 * @returns {Promise<{ terminalUrl, hops, finalRiskLevel, scanDurationMs }>}
 */
async function runDeepTrace(startUrl, emit) {
    const startTime = Date.now();
    const seenUrls = new Set();
    const hops = [];

    let browser = null;
    let currentUrl = startUrl;
    let currentUA = randomUA();

    const log = (text, type = 'info') => {
        // type: 'info' | 'success' | 'warn' | 'threat' | 'system'
        console.log(`[DeepTrace][${type.toUpperCase()}] ${text}`);
    };

    // ── Launch browser ────────────────────────────────────────────────────────
    try {
        browser = await puppeteer.launch({
            headless: 'new',          // new headless mode (less detectable than old)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1366,768',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
            ],
        });
    } catch (launchErr) {
        emit('error', { message: `Browser failed to launch: ${launchErr.message}` });
        throw launchErr;
    }

    emit('engine_ready', {
        logLine: '[*] Deep Trace Engine initialised. Stealth mode active.',
        timestamp: new Date().toISOString(),
    });

    // ── Hop loop ──────────────────────────────────────────────────────────────
    for (let hopIndex = 0; hopIndex < MAX_HOPS; hopIndex++) {

        const normUrl = normaliseUrl(currentUrl);

        // Loop detection
        if (seenUrls.has(normUrl)) {
            emit('loop_detected', {
                hopIndex,
                url: currentUrl,
                logLine: `[!] LOOP DETECTED on hop ${hopIndex + 1} — URL already visited. Stopping trace.`,
            });
            log(`Loop detected at hop ${hopIndex + 1}: ${currentUrl}`, 'warn');
            break;
        }
        seenUrls.add(normUrl);

        // Per-hop risk assessment
        const risk = assessHopRisk(currentUrl);
        const hopRecord = {
            hopIndex: hopIndex + 1,
            url: currentUrl,
            riskLevel: risk.riskLevel,
            riskScore: risk.score,
            riskSignals: risk.signals,
        };
        hops.push(hopRecord);

        let logPrefix = risk.riskLevel === 'malicious' ? '🔴 [THREAT]'
            : risk.riskLevel === 'suspicious' ? '🟠 [!]'
            : '🟢 [+]';

        emit('hop_discovered', {
            ...hopRecord,
            logLine: `${logPrefix} Hop ${hopIndex + 1}: ${currentUrl} — Risk: ${risk.riskLevel.toUpperCase()} (${risk.score}/100)`,
        });

        log(`Hop ${hopIndex + 1} → ${currentUrl} [${risk.riskLevel}]`, 'info');

        // Early exit on confirmed malicious hop
        if (risk.riskLevel === 'malicious') {
            emit('threat_found', {
                hopIndex: hopIndex + 1,
                url: currentUrl,
                riskScore: risk.score,
                signals: risk.signals,
                logLine: `🔴 [THREAT] Malicious URL confirmed on hop ${hopIndex + 1}. Aborting trace — do NOT proceed.`,
            });
            log(`Malicious hop confirmed — stopping.`, 'threat');
            break;
        }

        // ── Navigate to current URL ───────────────────────────────────────────
        const page = await browser.newPage();
        await page.setUserAgent(currentUA);
        await page.setViewport({ width: 1366, height: 768 });

        // Extra stealth: override navigator properties
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
            window.chrome = { runtime: {} };
        });

        let navSuccess = false;
        let navStatusCode = 200;

        // Intercept responses to catch 403 / 429
        page.on('response', response => {
            if (response.url() === currentUrl || response.request().isNavigationRequest()) {
                navStatusCode = response.status();
            }
        });

        try {
            emit('navigating', {
                hopIndex: hopIndex + 1,
                url: currentUrl,
                logLine: `[*] Hop ${hopIndex + 1}: Navigating to ${currentUrl}...`,
            });
            await page.goto(currentUrl, {
                waitUntil: 'domcontentloaded',
                timeout: NAV_TIMEOUT_MS,
            });
            navSuccess = true;
        } catch (navErr) {
            emit('nav_error', {
                hopIndex: hopIndex + 1,
                url: currentUrl,
                logLine: `[!] Hop ${hopIndex + 1}: Navigation failed — ${navErr.message.slice(0, 80)}`,
            });
            log(`Nav error on hop ${hopIndex + 1}: ${navErr.message}`, 'warn');
            await page.close();
            break;
        }

        // 403 retry with new UA
        if (navStatusCode === 403) {
            currentUA = randomUA();
            emit('bot_check_detected', {
                hopIndex: hopIndex + 1,
                logLine: `[!] Hop ${hopIndex + 1}: 403 Forbidden — rotating user agent and retrying...`,
            });
            await page.close();
            const retryPage = await browser.newPage();
            await retryPage.setUserAgent(currentUA);
            await retryPage.setViewport({ width: 1366, height: 768 });
            try {
                await retryPage.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
                emit('bot_check_passed', {
                    hopIndex: hopIndex + 1,
                    logLine: `[+] Hop ${hopIndex + 1}: Bypass successful after UA rotation.`,
                });
            } catch {
                emit('nav_error', {
                    hopIndex: hopIndex + 1,
                    logLine: `[!] Hop ${hopIndex + 1}: Retry also failed. Skipping hop.`,
                });
                await retryPage.close();
                break;
            }
            await retryPage.close();
        }

        // ── Check for JS countdown timer ──────────────────────────────────────
        const hasTimer = await detectJsTimer(page).catch(() => false);
        if (hasTimer) {
            emit('waiting_for_timer', {
                hopIndex: hopIndex + 1,
                durationMs: JS_TIMER_WAIT_MAX,
                logLine: `[!] Hop ${hopIndex + 1}: JS countdown timer detected. Waiting up to ${JS_TIMER_WAIT_MAX / 1000}s...`,
            });
            log(`JS timer found on hop ${hopIndex + 1} — waiting`, 'info');
            await randomDelay(JS_TIMER_WAIT_MAX, JS_TIMER_WAIT_MAX + 1000);
        }

        // ── Dismiss overlays ──────────────────────────────────────────────────
        await dismissOverlays(page);

        // Check if the page navigated away already (meta-refresh or client-side redirect)
        const pageUrlAfterNav = page.url();
        if (normaliseUrl(pageUrlAfterNav) !== normUrl) {
            // Navigation happened without us clicking — page auto-redirected
            await page.close();
            currentUrl = pageUrlAfterNav;
            emit('auto_redirect', {
                hopIndex: hopIndex + 1,
                newUrl: currentUrl,
                logLine: `[+] Hop ${hopIndex + 1}: Auto-redirect detected → ${currentUrl}`,
            });
            continue;
        }

        // ── Intelligent advance-element interaction ───────────────────────────
        const advanceEl = await findAdvanceElement(page).catch(() => null);

        if (advanceEl) {
            let elLabel = 'unknown button';
            try {
                elLabel = await page.evaluate(el => (el.innerText || el.value || el.getAttribute('aria-label') || 'button').trim().slice(0, 40), advanceEl);
            } catch { /* element may have detached */ }

            emit('interaction', {
                hopIndex: hopIndex + 1,
                action: 'click',
                element: elLabel,
                logLine: `[+] Hop ${hopIndex + 1}: Bypassing '${elLabel}' button...`,
            });
            log(`Clicking '${elLabel}' on hop ${hopIndex + 1}`, 'info');

            await randomDelay(); // human-like pause before clicking

            try {
                await humanClick(page, advanceEl);
                // Wait for navigation or network idle after click
                await Promise.race([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }),
                    new Promise(r => setTimeout(r, 5000)), // give up waiting after 5s if no nav
                ]);
            } catch { /* no navigation triggered by click — that's fine */ }

        } else {
            // No advance element — check if we're already at the terminal
            emit('no_interaction', {
                hopIndex: hopIndex + 1,
                logLine: `[*] Hop ${hopIndex + 1}: No advance element detected — page may be terminal or requires manual review.`,
            });
            const finalUrl = page.url();
            await page.close();
            currentUrl = finalUrl;
            break; // treat as terminal
        }

        const newUrl = page.url();
        await page.close();

        // If the page didn't change URL after interaction, treat as terminal
        if (normaliseUrl(newUrl) === normUrl) {
            emit('terminal_detected', {
                hopIndex: hopIndex + 1,
                url: newUrl,
                logLine: `[+] Hop ${hopIndex + 1}: No further redirect — terminal link identified.`,
            });
            currentUrl = newUrl;
            break;
        }

        currentUrl = newUrl;
    }

    // ── Max hops guard ────────────────────────────────────────────────────────
    if (hops.length >= MAX_HOPS) {
        emit('max_hops', { logLine: `[!] Max hop limit (${MAX_HOPS}) reached. Stopping trace.` });
    }

    // ── Close browser ─────────────────────────────────────────────────────────
    if (browser) {
        await browser.close().catch(() => { });
    }

    // ── Final result ──────────────────────────────────────────────────────────
    const scanDurationMs = Date.now() - startTime;
    const worstHop = hops.reduce((worst, h) => (h.riskScore > worst.riskScore ? h : worst), hops[0] || { riskScore: 0, riskLevel: 'clean' });
    const terminalRisk = assessHopRisk(currentUrl);
    const overallRiskLevel = worstHop.riskLevel === 'malicious' || terminalRisk.riskLevel === 'malicious'
        ? 'malicious'
        : worstHop.riskLevel === 'suspicious' || terminalRisk.riskLevel === 'suspicious'
            ? 'suspicious'
            : 'clean';

    const result = {
        terminalUrl: currentUrl,
        hops,
        totalHops: hops.length,
        finalRiskLevel: overallRiskLevel,
        terminalRisk,
        scanDurationMs,
        timestamp: new Date().toISOString(),
    };

    emit('complete', {
        ...result,
        logLine: `[✓] Trace complete — ${hops.length} hops traced in ${(scanDurationMs / 1000).toFixed(1)}s. Final verdict: ${overallRiskLevel.toUpperCase()}`,
    });

    log(`Trace finished. Terminal: ${currentUrl} | Hops: ${hops.length} | ${overallRiskLevel}`, 'success');
    return result;
}

module.exports = { runDeepTrace };
