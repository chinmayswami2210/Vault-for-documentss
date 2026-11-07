const express = require('express');
const cors = require('cors');
const path = require('path');

const { authRouter } = require('./routes/auth');
const evidenceRouter = require('./routes/evidence');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the uploads directory
const uploadsDir = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
} catch (e) {
    // Ignore error if filesystem cannot be created
}
app.use('/uploads', express.static(uploadsDir));

// Routes - mounted both with /api and without for Vercel rewrite compatibility
app.use('/api/auth', authRouter);
app.use('/auth', authRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/evidence', evidenceRouter);

app.get('/api', (req, res) => {
    res.json({ status: 'ok', message: 'Trace Vault API is running' });
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Trace Vault API is running' });
});

// Load env vars
require('dotenv').config();

// Start server only if run locally, otherwise export for Vercel
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
