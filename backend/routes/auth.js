const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { signUserToken } = require('../services/tokenService');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Basic field check before hitting the DB — mongoose would catch this too
    // but gives back a cryptic validation error object that the frontend can't easily display
    if (!username || !email || !password) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required — username, email, and password.',
        });
    }

    try {
        // Check duplicate before insert to surface a clean error message.
        // Letting the DB throw a duplicate key error (E11000) would work but looks terrible in logs.
        const duplicateCheck = await User.findOne({ $or: [{ email }, { username }] });
        if (duplicateCheck) {
            const conflictField = duplicateCheck.email === email ? 'email' : 'username';
            return res.status(400).json({
                success: false,
                message: `An account with that ${conflictField} already exists. Try logging in instead.`,
            });
        }

        const newUser = await User.create({ username, email, password });
        const authToken = signUserToken(newUser._id);

        console.log(`DEBUG [auth/register] New user registered: ${newUser.username} (${newUser.email})`);

        return res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token: authToken,
            user: newUser, // password stripped by toJSON() on the model
        });

    } catch (regErr) {
        // Mongoose ValidationError has a .errors object we can surface
        if (regErr instanceof mongoose.Error.ValidationError) {
            const firstValidationMsg = Object.values(regErr.errors)[0]?.message || 'Validation failed';
            return res.status(400).json({ success: false, message: firstValidationMsg });
        }

        console.error('[auth/register] Unexpected error during registration:', regErr.message);
        return res.status(500).json({
            success: false,
            message: 'Registration failed due to a server error. Please try again.',
        });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are both required.' });
    }

    try {
        // Intentionally using the same error message for "user not found" and "wrong password"
        // to avoid leaking which emails are registered — classic OWASP recommendation
        const foundUser = await User.findOne({ email });
        if (!foundUser) {
            return res.status(401).json({ success: false, message: 'Invalid credentials. Please check your email and password.' });
        }

        const passwordsMatch = await foundUser.comparePassword(password);
        if (!passwordsMatch) {
            // TODO: add failed login attempt counter here — brute force protection is on the backlog
            return res.status(401).json({ success: false, message: 'Invalid credentials. Please check your email and password.' });
        }

        const authToken = signUserToken(foundUser._id);

        return res.json({
            success: true,
            message: 'Login successful',
            token: authToken,
            user: foundUser,
        });

    } catch (loginErr) {
        console.error('[auth/login] Error during login for email:', email, '—', loginErr.message);
        return res.status(500).json({
            success: false,
            message: 'Login failed due to a server error. Please try again.',
        });
    }
});

// GET /api/auth/profile — requires valid JWT
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const profileUser = await User.findById(req.user.id);
        if (!profileUser) {
            // This can happen if the account was deleted after the token was issued
            return res.status(404).json({ success: false, message: 'User account not found. It may have been deleted.' });
        }
        return res.json({ success: true, user: profileUser });

    } catch (profileErr) {
        console.error('[auth/profile] Error fetching user profile for id:', req.user?.id, '—', profileErr.message);
        return res.status(500).json({ success: false, message: 'Could not load profile. Please try again.' });
    }
});

module.exports = router;
