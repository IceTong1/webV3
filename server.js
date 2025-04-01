// --- Dependencies ---
const express = require('express'); // Web framework
const bodyParser = require('body-parser'); // Middleware to parse form data
const session = require('express-session'); // Middleware for session management
const SQLiteStore = require('connect-sqlite3')(session); // Store sessions in SQLite
const path = require('path'); // Utility for working with file paths
const fs = require('fs'); // File system module (needed for error view check)

// --- Controller Imports ---
// Import route handlers defined in separate controller files
const authController = require('./controllers/authController'); // Handles authentication routes
const textController = require('./controllers/textController'); // Handles text management and practice routes

// --- Middleware Imports ---
const authMiddleware = require('./middleware/authMiddleware'); // Middleware to protect routes

// --- Express App Initialization ---
const app = express(); // Create an Express application instance
const port = 3000; // Define the port the server will listen on

// --- Middleware Configuration ---

// Body Parser: Parses incoming request bodies with URL-encoded payloads (form submissions)
app.use(bodyParser.urlencoded({ extended: true }));
// Body Parser: Parses incoming request bodies with JSON payloads
app.use(bodyParser.json());

// Static Files: Serve static files (like CSS, client-side JS, images) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
// Session Management: Configure session handling
app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './models' }),
    secret: 'your secret key', // IMPORTANT: Change this in production!
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // Cookie expiration time: 1 week
    }
}));

// Middleware to make session user available in all views
app.use((req, res, next) => {
    res.locals.user = req.session.user; // Make user available in templates
    next();
});


// --- View Engine Setup ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Route Definitions ---

// Homepage Route
app.get('/', (req, res) => {
    res.render('index');
});

// Favicon Route
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Mount Authentication & Text Controllers
app.use('/', authController); // Handles /login, /register, /logout etc.
app.use('/', textController); // Handles /profile, /texts, /practice etc.


// --- Error Handling Middleware (Generic - place after all routes) ---
// Catch-all for other errors not handled by specific routes
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err.stack || err); // Log stack trace if available
    const statusCode = err.status || 500;
    res.status(statusCode);

    // Attempt to render a dedicated error page
    try {
        // Check if the 'error.ejs' view exists before trying to render
        const errorViewPath = path.join(__dirname, 'views', 'error.ejs');
        if (fs.existsSync(errorViewPath)) {
            res.render('error', {
                message: err.message || 'An unexpected error occurred.',
                // Provide stack trace only in development for security
                error: process.env.NODE_ENV === 'development' ? err : {},
                status: statusCode // Pass status code to the view if needed
            });
        } else {
            // Fallback if error.ejs doesn't exist
            console.warn("Warning: 'views/error.ejs' not found. Sending plain text error.");
            res.type('text/plain').send(`Server Error (${statusCode})`);
        }
    } catch (renderError) {
        // Fallback if rendering the error page itself fails
        console.error("Error rendering error page:", renderError);
        res.type('text/plain').send(`Server Error (${statusCode})`);
    }
});


// --- Server Start ---
// Only start listening if the script is run directly (not required by another module like tests)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// --- Export App for Testing ---
module.exports = app; // Export the configured Express app