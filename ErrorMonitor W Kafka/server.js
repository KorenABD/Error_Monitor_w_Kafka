const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { db, testConnection, initDatabase } = require('./database');
const { generateToken, authenticateToken, requireRole } = require('./middleware/auth');
const { loginSchema, registerSchema } = require('./validation/schemas');
const kafkaService = require('./kafka/kafkaService');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static('public'));

// Public routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', async (req, res) => {
  const dbConnected = await testConnection();
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
    kafka: kafkaService.isConnected ? 'connected' : 'disconnected'
  });
});

// Authentication routes (unchanged)
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }

    const { email, password, firstName, lastName } = value;

    const existingUser = await db('users').where('email', email).first();
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [newUser] = await db('users').insert({
      email: email.toLowerCase(),
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      role: 'user'
    }).returning(['id', 'email', 'first_name', 'last_name', 'role', 'created_at']);

    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        role: newUser.role
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
    }

    const { email, password } = value;

    const user = await db('users')
      .where('email', email.toLowerCase())
      .where('is_active', true)
      .first();

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await db('users').where('id', user.id).update({ last_login: new Date() });

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.first_name,
      lastName: req.user.last_name,
      role: req.user.role
    }
  });
});

// Protected routes with Kafka integration
app.get('/api/errors', authenticateToken, async (req, res) => {
  try {
    const { resolved, category, limit = 100 } = req.query;

    let query = db('errors').orderBy('created_at', 'desc').limit(parseInt(limit));

    if (resolved !== undefined) {
      query = query.where('resolved', resolved === 'true');
    }

    if (category && category !== 'all') {
      query = query.where('category', category);
    }

    const errors = await query;
    res.json(errors);
  } catch (error) {
    console.error('Error fetching errors:', error);
    res.status(500).json({ error: 'Failed to fetch errors' });
  }
});

app.post('/api/errors', authenticateToken, async (req, res) => {
  try {
    const errorData = {
      message: req.body.message,
      severity: req.body.severity,
      category: req.body.category,
      description: req.body.description,
      stack: req.body.stack,
      url: req.body.url,
      user_agent: req.body.userAgent,
      resolved: false
    };

    const [insertedError] = await db('errors').insert(errorData).returning('*');
    console.log('Error saved to database:', insertedError.id);

    // 🔥 Publish error event to Kafka
    await kafkaService.publishError(insertedError);

    res.json({ success: true, error: insertedError });
  } catch (error) {
    console.error('Error saving to database:', error);
    res.status(500).json({ error: 'Failed to save error' });
  }
});

app.patch('/api/errors/:id/resolve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { resolveComment } = req.body;

    const [updatedError] = await db('errors')
      .where('id', id)
      .update({
        resolved: true,
        resolved_at: new Date(),
        resolve_comment: resolveComment,
        resolved_by: `${req.user.first_name} ${req.user.last_name}`,
        updated_at: new Date()
      })
      .returning('*');

    if (!updatedError) {
      return res.status(404).json({ error: 'Error not found' });
    }

    // 🔥 Publish error resolution to Kafka
    await kafkaService.publishErrorResolution(updatedError);

    res.json({ success: true, error: updatedError });
  } catch (error) {
    console.error('Error resolving error:', error);
    res.status(500).json({ error: 'Failed to resolve error' });
  }
});

app.patch('/api/errors/:id/unresolve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const [updatedError] = await db('errors')
      .where('id', id)
      .update({
        resolved: false,
        resolved_at: null,
        resolve_comment: null,
        resolved_by: null,
        updated_at: new Date()
      })
      .returning('*');

    if (!updatedError) {
      return res.status(404).json({ error: 'Error not found' });
    }

    res.json({ success: true, error: updatedError });
  } catch (error) {
    console.error('Error unresolving error:', error);
    res.status(500).json({ error: 'Failed to unresolve error' });
  }
});

app.delete('/api/errors', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const deletedCount = await db('errors').del();
    res.json({ success: true, deletedCount });
  } catch (error) {
    console.error('Error deleting errors:', error);
    res.status(500).json({ error: 'Failed to delete errors' });
  }
});

app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await db('errors')
      .select('category', 'severity', 'resolved')
      .count('* as count')
      .groupBy('category', 'severity', 'resolved');

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Start server
async function startServer() {
  try {
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.log('⏳ Waiting for database to be ready...');
      setTimeout(startServer, 3000);
      return;
    }

    await initDatabase();

    // Initialize Kafka connection
    setTimeout(async () => {
      console.log('🔄 Initializing Kafka connection...');
      await kafkaService.connect();
    }, 10000); // Wait 10 seconds for Kafka to be fully ready

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log('🔐 Authentication system enabled!');
      console.log('📨 Kafka message queue integration ready!');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Gracefully shutting down...');
  await kafkaService.disconnect();
  await db.destroy();
  process.exit(0);
});

startServer();