const mongoose = require('mongoose');

// Pulled this out of server.js because having DB logic in the entry file
// made it impossible to import routes in unit tests without spawning the whole server.
// Took me an afternoon to figure out why jest was hanging — this was the fix.

async function connectDB() {
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
        // Crashed in prod once because .env wasn't loaded before this ran.
        // Now we fail loudly here instead of getting a cryptic mongoose error downstream.
        throw new Error('MONGODB_URI is not set in environment variables. Check your .env file.');
    }

    console.log('DEBUG [db.js] Attempting MongoDB connection...');

    await mongoose.connect(mongoUri, {
        // These were the defaults in mongoose 5.x — had to add them back in v6 after an upgrade broke prod.
        // Don't remove them without testing first.
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected to:', mongoose.connection.name);
}

module.exports = { connectDB };
