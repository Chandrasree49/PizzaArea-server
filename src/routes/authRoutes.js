import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDB } from '../config/db.js';
import { JWT_SECRET, verifyToken } from '../middlewares/authMiddleware.js';

const router = express.Router();


function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function isValidPassword(password) {
  if (!password || password.length < 6) return false;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  return hasUpperCase && hasLowerCase;
}


router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, image, businessName } = req.body;


    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

 
    if (role !== 'customer' && role !== 'vendor') {
      return res.status(400).json({ success: false, message: 'Invalid role. Choose Customer or Vendor.' });
    }


    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long and contain at least one uppercase and one lowercase letter.'
      });
    }

    const db = getDB();
    const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }


    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      isBlocked: false,
      businessName: role === 'vendor' ? (businessName || `${name}'s Pizzeria`) : '',
      subscriptionPlan: 'free',
      subscriptionExpiresAt: null,
      image: image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
      createdAt: new Date(),
    };

    const result = await db.collection('users').insertOne(newUser);
    newUser._id = result.insertedId;

    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: newUser._id.toString(),
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        image: newUser.image,
        businessName: newUser.businessName,
        subscriptionPlan: newUser.subscriptionPlan,
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during registration' });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email and password' });
    }

    const db = getDB();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended by an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        businessName: user.businessName,
        subscriptionPlan: user.subscriptionPlan || 'free',
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
});


router.post('/google', async (req, res) => {
  try {
    const { email, name, image, role } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Google account email is required' });
    }

    const db = getDB();
    let user = await db.collection('users').findOne({ email: email.toLowerCase() });

    if (!user) {
    
      const assignedRole = (role === 'vendor' ? 'vendor' : 'customer');
      const newUser = {
        name: name || 'Google User',
        email: email.toLowerCase(),
        password: '', 
        role: assignedRole,
        isBlocked: false,
        businessName: assignedRole === 'vendor' ? `${name}'s Pizzeria` : '',
        subscriptionPlan: 'free',
        subscriptionExpiresAt: null,
        image: image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=300&q=80',
        createdAt: new Date(),
      };

      const result = await db.collection('users').insertOne(newUser);
      newUser._id = result.insertedId;
      user = newUser;
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been suspended by an administrator.' });
    }

    const token = generateToken(user);

    return res.json({
      success: true,
      message: 'Google login successful!',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image,
        businessName: user.businessName,
        subscriptionPlan: user.subscriptionPlan || 'free',
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during Google auth' });
  }
});


router.get('/me', verifyToken, async (req, res) => {
  return res.json({ success: true, user: req.user });
});
export default router;