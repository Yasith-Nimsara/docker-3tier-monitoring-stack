const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// Connect to the 'mongodb' container over Docker's private network
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/devopsdb';

mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB container!'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Simple schema to store tasks in the database
const TaskSchema = new mongoose.Schema({
  title: String,
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model('Task', TaskSchema);

// 1. Health check endpoint
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    database: dbState,
    container_id: process.env.HOSTNAME
  });
});

// 2. Get all saved tasks
app.get('/api/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json(tasks);
});

// 3. Save a new task
app.post('/api/tasks', async (req, res) => {
  const task = await Task.create({ title: req.body.title || 'My First DevOps Task' });
  res.status(201).json(task);
});

app.listen(5000, '0.0.0.0', () => console.log('Backend listening on port 5000'));
