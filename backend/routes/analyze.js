'use strict';

const express = require('express');
const requireAuth = require('../middleware/auth');
const { analyzeJobRisk, analyzeLinkRisk, analyzeResumeText } = require('../utils/riskEngine');

const router = express.Router();

// Shared handler for job posting analysis — both the authenticated and demo routes
// go through this so we don't have to maintain two copies of the same validation logic.
// Learned that lesson the hard way when the demo route had a bug that prod didn't, for 2 weeks.
function processJobAnalysisRequest(req, res) {
    res.setHeader('Content-Type', 'application/json');

    const { jobText, jobTitle, company, recruiterEmail } = req.body || {};

    // quick look at what we got from the frontend
    console.log('checking job data from frontend ->', {
        jobTitle: jobTitle || '(none)',
        company: company || '(none)',
        textLength: typeof jobText === 'string' ? jobText.length : 'not a string',
    });

    if (!jobText || typeof jobText !== 'string' || jobText.trim().length < 10) {
        return res.status(400).json({
            success: false,
            riskScore: 0,
            riskLevel: 'LOW RISK',
            category: 'Low Risk',
            detectedFlags: [],
            trustSignals: [],
            deductions: [],
            reasons: [],
            confidence: 0,
            message: 'Job posting text is too short — need at least 10 characters to run analysis.',
        });
    }

    // Wrapping the engine call in its own try-catch so a crash inside riskEngine
    // doesn't bubble up to the global error handler and return a non-JSON response.
    // This happened once during a regex catastrophe on a particularly weird job description.
    let engineOutput;
    try {
        engineOutput = analyzeJobRisk(jobText, recruiterEmail || '');
    } catch (engineCrash) {
        console.error('[analyze/fake-job] riskEngine.analyzeJobRisk() threw an exception:', engineCrash.message);
        console.error('[analyze/fake-job] Offending jobText snippet:', jobText.slice(0, 150));
        return res.status(500).json({
            success: false,
            riskScore: 0,
            riskLevel: 'ERROR',
            category: 'Error',
            deductions: [],
            reasons: ['Analysis engine encountered an error — our team has been notified.'],
            confidence: 0,
            message: 'Risk engine failed unexpectedly. Please try again.',
        });
    }

    // Defensive normalisation — the engine *should* always return numbers,
    // but there was a period where certain edge cases returned undefined and the frontend
    // showed "NaN/100" in the score ring, which looked horrendous in the demo.
    let finalRiskScore = engineOutput?.score ?? engineOutput?.riskScore ?? 0;
    if (typeof finalRiskScore !== 'number' || isNaN(finalRiskScore)) finalRiskScore = 0;
    finalRiskScore = Math.min(100, Math.max(0, finalRiskScore));

    const acceptableRiskLevels = ['LOW RISK', 'MID RISK', 'HIGH RISK', 'SAFE', 'SUSPICIOUS'];
    let finalRiskLevel = engineOutput?.riskLevel ?? 'LOW RISK';
    if (!acceptableRiskLevels.includes(finalRiskLevel)) finalRiskLevel = 'LOW RISK';

    let analysisConfidence = engineOutput?.confidence ?? 0;
    if (typeof analysisConfidence !== 'number' || isNaN(analysisConfidence)) analysisConfidence = 0;
    analysisConfidence = Math.min(100, Math.max(0, analysisConfidence));

    const analysisResponse = {
        success: true,
        jobTitle: jobTitle || 'Unknown Position',
        company: company || 'Unknown Company',
        analyzedAt: new Date().toISOString(),
        score: finalRiskScore,
        riskScore: finalRiskScore,   // kept for backwards compat with older frontend calls
        riskLevel: finalRiskLevel,
        category: engineOutput?.category ?? 'Low Risk',
        colorClass: engineOutput?.colorClass ?? 'text-green',
        colorHex: engineOutput?.colorHex ?? '#22c55e',
        deductions: Array.isArray(engineOutput?.deductions) ? engineOutput.deductions : [],
        reasons: Array.isArray(engineOutput?.reasons) ? engineOutput.reasons : [],
        detectedFlags: Array.isArray(engineOutput?.detectedFlags) ? engineOutput.detectedFlags : [],
        trustSignals: Array.isArray(engineOutput?.trustSignals) ? engineOutput.trustSignals : [],
        confidence: analysisConfidence,
        breakdown: engineOutput?.breakdown ?? {},
    };

    console.log('job analysis done ->', {
        score: analysisResponse.riskScore,
        level: analysisResponse.riskLevel,
    });

    return res.json(analysisResponse);
}

// POST /api/analyze/fake-job — protected route for logged-in users
router.post('/fake-job', requireAuth, (req, res) => {
    try {
        processJobAnalysisRequest(req, res);
    } catch (unexpectedErr) {
        console.error('[analyze /fake-job] Outer catch triggered — this should not happen:', unexpectedErr.message);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({
            success: false, riskScore: 0, riskLevel: 'ERROR',
            category: 'Error', deductions: [], reasons: [],
            detectedFlags: [], trustSignals: [], confidence: 0,
        });
    }
});

// POST /api/analyze/fake-job/public — no auth, used for the landing page demo
// Note: rate limiting this endpoint is on the backlog — for now it's wide open
router.post('/fake-job/public', (req, res) => {
    try {
        processJobAnalysisRequest(req, res);
    } catch (unexpectedErr) {
        console.error('[analyze /fake-job/public] Outer catch triggered:', unexpectedErr.message);
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({
            success: false, riskScore: 0, riskLevel: 'ERROR',
            category: 'Error', deductions: [], reasons: [],
            detectedFlags: [], trustSignals: [], confidence: 0,
        });
    }
});

// POST /api/analyze/link — protected
router.post('/link', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { url } = req.body || {};

    if (!url || typeof url !== 'string' || url.trim().length < 4) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a valid URL to scan (minimum 4 characters).',
        });
    }

    const sanitizedUrl = url.trim();
    console.log('scanning link ->', sanitizedUrl);

    try {
        const linkEngineOutput = analyzeLinkRisk(sanitizedUrl);

        return res.json({
            success: true,
            url: sanitizedUrl,
            scannedAt: new Date().toISOString(),
            score: linkEngineOutput.score,
            riskScore: linkEngineOutput.score,
            category: linkEngineOutput.category,
            deductions: linkEngineOutput.deductions,
            reasons: linkEngineOutput.reasons,
            riskLevel: linkEngineOutput.riskLevel,
            verdict: linkEngineOutput.verdict,
            healthScore: linkEngineOutput.healthScore,
            detectedSignals: linkEngineOutput.detectedSignals,
            trustSignals: linkEngineOutput.trustSignals,
            // MID-RISK 5-rule grey area classification
            isMidRiskGreyArea: linkEngineOutput.isMidRiskGreyArea ?? false,
            midRiskRule: linkEngineOutput.midRiskRule ?? null,
            midRiskCategory: linkEngineOutput.midRiskCategory ?? null,
            midRiskRules: linkEngineOutput.midRiskRules ?? [],
            explanation: linkEngineOutput.explanation,
        });

    } catch (linkScanErr) {
        console.error('[analyze/link] analyzeLinkRisk() failed for URL:', sanitizedUrl, '—', linkScanErr.message);
        return res.status(500).json({
            success: false,
            message: 'Link scan failed — the URL may be malformed or the engine hit an edge case. Try again.',
        });
    }
});

// POST /api/analyze/resume-text — protected
router.post('/resume-text', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { resumeText } = req.body || {};

    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length < 20) {
        return res.status(400).json({
            success: false,
            message: 'Please paste at least 20 characters of your resume text.',
        });
    }

    const trimmedResumeText = resumeText.trim();
    console.log('resume text received, length:', trimmedResumeText.length, 'chars');

    try {
        const resumeEngineOutput = analyzeResumeText(trimmedResumeText);

        return res.json({
            success: true,
            analyzedAt: new Date().toISOString(),
            score: resumeEngineOutput.score,
            category: resumeEngineOutput.category,
            deductions: resumeEngineOutput.deductions,
            reasons: resumeEngineOutput.reasons,
            keywordScore: resumeEngineOutput.keywordScore,
            actionVerbScore: resumeEngineOutput.actionVerbScore,
            atsScore: resumeEngineOutput.atsScore,
            suggestions: resumeEngineOutput.suggestions,
            // Legacy fields kept because removing them broke the dashboard history tab once
            careerStrengthScore: resumeEngineOutput.careerStrengthScore,
            riskScore: resumeEngineOutput.riskScore,
        });

    } catch (resumeAnalysisErr) {
        console.error('[analyze/resume-text] analyzeResumeText() threw:', resumeAnalysisErr.message);
        return res.status(500).json({
            success: false,
            message: `Resume text analysis failed: ${resumeAnalysisErr.message}. Please try again.`,
        });
    }
});

module.exports = router;
