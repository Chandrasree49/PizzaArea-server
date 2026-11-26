import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { verifyToken, verifyRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, verifyRole(['customer']));


router.get('/stats', async (req, res) => {
  try {
    const db = getDB();
    const customerId = req.user.id;

    const totalOrders = await db.collection('orders').countDocuments({ customerId });
    const pendingOrders = await db.collection('orders').countDocuments({ customerId, status: 'pending' });
    const acceptedOrders = await db.collection('orders').countDocuments({ customerId, status: 'accepted' });
    const rejectedOrders = await db.collection('orders').countDocuments({ customerId, status: 'rejected' });
    const cancelledOrders = await db.collection('orders').countDocuments({ customerId, status: 'cancelled' });

    return res.json({
      success: true,
      stats: {
        totalOrders,
        pendingOrders,
        acceptedOrders,
        rejectedOrders,
        cancelledOrders,
      }
    });
  } catch (error) {
    console.error('Customer stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch customer statistics' });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const db = getDB();
    const orders = await db.collection('orders')
      .find({ customerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error('Customer orders fetch error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch your orders' });
  }
});


router.post('/orders', async (req, res) => {
  try {
    const { itemId, deliveryDate, deliveryAddress, message } = req.body;

    if (!itemId || !deliveryDate || !deliveryAddress) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Delivery Date, Delivery Address, and a valid Menu Item'
      });
    }

    if (!ObjectId.isValid(itemId)) {
      return res.status(400).json({ success: false, message: 'Invalid menu item ID' });
    }

    const db = getDB();
    const item = await db.collection('menuItems').findOne({ _id: new ObjectId(itemId) });

    if (!item) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    if (item.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'This pizza is currently unavailable for ordering' });
    }

    
    if (item.vendorId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Vendors cannot order their own items' });
    }

 
    const existingActiveOrder = await db.collection('orders').findOne({
      customerId: req.user.id,
      itemId: item._id.toString(),
      deliveryDate: deliveryDate,
      status: { $in: ['pending', 'accepted'] }
    });

    if (existingActiveOrder) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active order for this item on the selected delivery date!'
      });
    }

    const newOrder = {
      itemId: item._id.toString(),
      itemName: item.itemName,
      itemImage: (item.images && item.images[0]) || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80',
      price: item.price,
      vendorId: item.vendorId,
      vendorName: item.vendorName || 'PizzaArea Partner',
      customerId: req.user.id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      deliveryDate,
      deliveryAddress: deliveryAddress.trim(),
      message: (message || '').trim(),
      status: 'pending', 
      createdAt: new Date(),
    };

    const result = await db.collection('orders').insertOne(newOrder);
    newOrder._id = result.insertedId;

    return res.status(201).json({
      success: true,
      message: 'Pizza order submitted successfully! Your restaurant will review it shortly.',
      data: newOrder
    });
  } catch (error) {
    console.error('Order creation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit order' });
  }
});


router.patch('/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const db = getDB();
    const order = await db.collection('orders').findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.customerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You cannot cancel another customer order' });
    }

  
    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is already ${order.status}.`
      });
    }

    await db.collection('orders').updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'cancelled', updatedAt: new Date() } }
    );

    return res.json({
      success: true,
      message: 'Your order has been cancelled successfully.'
    });
  } catch (error) {
    console.error('Order cancellation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});
export default router;