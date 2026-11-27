import express from 'express';
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { verifyToken, verifyRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(verifyToken, verifyRole(["admin"]));


router.get("/stats", async (req, res) => {
  try {
    const db = getDB();

    const totalUsers = await db.collection("user").countDocuments();
    const totalVendors = await db
      .collection("user")
      .countDocuments({ role: "vendor" });
    const totalCustomers = await db
      .collection("user")
      .countDocuments({ role: "customer" });
    const totalMenuItems = await db.collection("menuItems").countDocuments();
    const pendingMenuItems = await db
      .collection("menuItems")
      .countDocuments({ status: "pending" });
    const totalOrders = await db.collection("orders").countDocuments();
    const totalTransactions = await db
      .collection("transactions")
      .countDocuments();

    const revenueAgg = await db
      .collection("transactions")
      .aggregate([
        { $match: { status: "succeeded" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ])
      .toArray();
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalVendors,
        totalCustomers,
        totalMenuItems,
        pendingMenuItems,
        totalOrders,
        totalTransactions,
        totalRevenue,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load admin statistics" });
  }
});


router.get("/user", async (req, res) => {
  try {
    const { search, role } = req.query;
    const db = getDB();
    const query = {};

    if (search && search.trim() !== "") {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
        { businessName: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (role && ["vendor", "customer", "admin"].includes(role)) {
      query.role = role;
    }

    const users = await db
      .collection("user")
      .find(query, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    console.error("Admin users fetch error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch users" });
  }
});


router.patch("/users/:id/block", async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (typeof isBlocked !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "isBlocked must be a boolean" });
    }

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID" });
    }

    if (id === req.user.id) {
      return res
        .status(400)
        .json({
          success: false,
          message: "You cannot block your own admin account!",
        });
    }

    const db = getDB();
    await db
      .collection("user")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { isBlocked, updatedAt: new Date() } }
      );

    return res.json({
      success: true,
      message: `User successfully ${isBlocked ? "blocked" : "unblocked"}!`,
      isBlocked,
    });
  } catch (error) {
    console.error("User block toggle error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update user block status" });
  }
});


router.get("/items", async (req, res) => {
  try {
    const { search, status, category } = req.query;
    const db = getDB();
    const query = {};

    if (search && search.trim() !== "") {
      query.$or = [
        { itemName: { $regex: search.trim(), $options: "i" } },
        { vendorName: { $regex: search.trim(), $options: "i" } },
        { location: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (status && status !== "All") {
      query.status = status;
    }

    if (category && category !== "All") {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

    const items = await db
      .collection("menuItems")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    console.error("Admin items fetch error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch menu items" });
  }
});

router.patch("/items/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "pending", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid item ID" });
    }

    const db = getDB();
    await db
      .collection("menuItems")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, updatedAt: new Date() } }
      );

    return res.json({
      success: true,
      message: `Menu item status updated to ${status}!`,
      status,
    });
  } catch (error) {
    console.error("Menu item status change error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update menu item status" });
  }
});


router.delete("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid item ID" });
    }

    const db = getDB();
    await db.collection("menuItems").deleteOne({ _id: new ObjectId(id) });

    return res.json({
      success: true,
      message: "Menu item deleted by administrator",
    });
  } catch (error) {
    console.error("Delete item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete menu item" });
  }
});


router.get("/transactions", async (req, res) => {
  try {
    const db = getDB();
    const transactions = await db
      .collection("transactions")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      count: transactions.length,
      data: transactions,
    });
  } catch (error) {
    console.error("Transactions fetch error:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch platform transactions",
      });
  }
});
export default router;
