import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';

export const JWT_SECRET = process.env.JWT_SECRET_KEY || 'pizzahub_jwt_secret_key_2026_artisan_secure';

export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const db = getDB();
    let user = null;

 
    const session = await db.collection('session').findOne({ token });
    if (session) {
      const query = {
        $or: [
          { _id: session.userId },
          ...(ObjectId.isValid(session.userId) ? [{ _id: new ObjectId(session.userId) }] : [])
        ]
      };
      user = (await db.collection('user').findOne(query)) || (await db.collection('users').findOne(query));
    }

    if (!user) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const query = {
          $or: [
            { _id: decoded.userId },
            ...(ObjectId.isValid(decoded.userId) ? [{ _id: new ObjectId(decoded.userId) }] : [])
          ]
        };
        user = (await db.collection('user').findOne(query)) || (await db.collection('users').findOne(query));
      } catch (jwtErr) {}
    }

    if (!user && token.startsWith('session_')) {
      const uid = token.replace('session_', '');
      const query = {
        $or: [
          { _id: uid },
          ...(ObjectId.isValid(uid) ? [{ _id: new ObjectId(uid) }] : [])
        ]
      };
      user = (await db.collection('user').findOne(query)) || (await db.collection('users').findOne(query));
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found or session expired' });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Your account has been suspended by an administrator.',
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      subscriptionPlan: user.subscriptionPlan || 'free',
      businessName: user.businessName || '',
      image: user.image || '',
    };

    next();
  } catch (error) {
    console.error('Auth verification error:', error.message);
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or expired token' });
  }
}

export function verifyRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to [${allowedRoles.join(', ')}] role only`,
      });
    }
    next();
  };
}