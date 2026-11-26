import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken, verifyRole } from "../middlewares/authMiddleware.js";

const router = express.Router();


router.use(verifyToken, verifyRole(["vendor"]));


router.get("/stats", async (req, res) => {
  try {
    const db = getDB();
    const vendorId = req.user.id;

  
    const totalItems = await db
      .collection("menuItems")
      .countDocuments({ vendorId });
    const activeItems = await db.collection("menuItems").countDocuments({
      vendorId,
      status: "approved",
    });

   
    const pendingOrders = await db.collection("orders").countDocuments({
      vendorId,
      status: "pending",
    });
    const acceptedOrders = await db.collection("orders").countDocuments({
      vendorId,
      status: "accepted",
    });
    const rejectedOrders = await db.collection("orders").countDocuments({
      vendorId,
      status: "rejected",
    });

    return res.json({
      success: true,
      stats: {
        totalItems,
        activeItems,
        pendingOrders,
        acceptedOrders,
        rejectedOrders,
        subscriptionPlan: req.user.subscriptionPlan || "free",
        maxFreeItems: 3,
      },
    });
  } catch (error) {
    console.error("Vendor stats error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load vendor statistics" });
  }
});


router.get("/items", async (req, res) => {
  try {
    const db = getDB();
    const items = await db
      .collection("menuItems")
      .find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, count: items.length, data: items });
  } catch (error) {
    console.error("Fetch vendor items error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch your menu items" });
  }
});


router.post("/items", async (req, res) => {
  try {
    const { itemName, category, description, price, location, images, image } =
      req.body;

    if (
      !itemName ||
      !category ||
      !description ||
      price === undefined ||
      !location
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    const itemImage = images && images.length > 0 ? images[0] : image;
    if (!itemImage) {
      return res.status(400).json({
        success: false,
        message: "Item image is required (ImgBB upload)",
      });
    }

    const db = getDB();
    const vendorId = req.user.id;

    if (req.user.subscriptionPlan !== "premium") {
      const activeCount = await db.collection("menuItems").countDocuments({
        vendorId,
        status: { $in: ["approved", "pending"] },
      });

      if (activeCount >= 3) {
        return res.status(403).json({
          success: false,
          message:
            "Free plan limit reached (max 3 items). Please upgrade to Premium for unlimited menu items!",
        });
      }
    }

    const newItem = {
      vendorId,
      vendorName: req.user.businessName || req.user.name,
      itemName: itemName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: parseFloat(price),
      location: location.trim(),
      images: Array.isArray(images) && images.length > 0 ? images : [itemImage],
      status: "pending", // Pending until admin approves
      isFeatured: req.user.subscriptionPlan === "premium", // Premium vendors get featured placement
      createdAt: new Date(),
    };

    const result = await db.collection("menuItems").insertOne(newItem);
    newItem._id = result.insertedId;

    return res.status(201).json({
      success: true,
      message: "Menu item created successfully and submitted for Admin review!",
      data: newItem,
    });
  } catch (error) {
    console.error("Create menu item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create menu item" });
  }
});


router.put("/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid item ID" });
    }

    const db = getDB();
    const existing = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(id) });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Menu item not found" });
    }


    if (existing.vendorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not own this menu item",
      });
    }

    const { itemName, category, description, price, location, images, status } =
      req.body;
    const updateData = {};

    if (itemName) updateData.itemName = itemName.trim();
    if (category) updateData.category = category.trim();
    if (description) updateData.description = description.trim();
    if (price !== undefined) updateData.price = parseFloat(price);
    if (location) updateData.location = location.trim();
    if (images && images.length > 0) updateData.images = images;

    
    if (status && ["inactive", "approved"].includes(status)) {
      if (existing.status !== "rejected") {
        updateData.status = status;
      }
    }

    updateData.updatedAt = new Date();

    await db
      .collection("menuItems")
      .updateOne({ _id: new ObjectId(id) }, { $set: updateData });

    const updated = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(id) });

    return res.json({
      success: true,
      message: "Menu item updated successfully!",
      data: updated,
    });
  } catch (error) {
    console.error("Update item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update menu item" });
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
    const item = await db
      .collection("menuItems")
      .findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Menu item not found" });
    }

    
    if (item.vendorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not own this item",
      });
    }

    await db.collection("menuItems").deleteOne({ _id: new ObjectId(id) });

    return res.json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    console.error("Delete item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete menu item" });
  }
});


router.get("/orders", async (req, res) => {
  try {
    const db = getDB();
    const orders = await db
      .collection("orders")
      .find({ vendorId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error("Vendor orders error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch customer orders" });
  }
});


router.patch("/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be accepted or rejected",
      });
    }

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order ID" });
    }

    const db = getDB();
    const order = await db
      .collection("orders")
      .findOne({ _id: new ObjectId(id) });

    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

   
    if (order.vendorId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You do not manage this order",
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Order is already ${order.status} and cannot be modified again.`,
      });
    }

    await db
      .collection("orders")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, updatedAt: new Date() } }
      );

    return res.json({
      success: true,
      message: `Order successfully ${status}!`,
      status,
    });
  } catch (error) {
    console.error("Order status update error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update order status" });
  }
});

module.exports = router;
export default router;
