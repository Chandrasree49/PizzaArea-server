import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const router = express.Router();


router.get("/", async (req, res) => {
  try {
    const { search, category, location, sort, featured } = req.query;
    const db = getDB();

    
    const query = {
      status: "approved",
    };

  
    if (search && search.trim() !== "") {
      query.$or = [
        { itemName: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
        { category: { $regex: search.trim(), $options: "i" } },
      ];
    }

   
    if (category && category !== "All" && category.trim() !== "") {
      query.category = { $regex: new RegExp(`^${category.trim()}$`, "i") };
    }

   
    if (location && location !== "All" && location.trim() !== "") {
      query.location = { $regex: location.trim(), $options: "i" };
    }

   
    if (featured === "true") {
      query.isFeatured = true;
    }

   
    let sortOptions = { createdAt: -1 };
    if (sort === "price_asc") {
      sortOptions = { price: 1 };
    } else if (sort === "price_desc") {
      sortOptions = { price: -1 };
    } else if (sort === "oldest") {
      sortOptions = { createdAt: 1 };
    }

    const items = await db
      .collection("menuItems")
      .find(query)
      .sort(sortOptions)
      .toArray();

    return res.json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error("Menu items fetch error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch menu items" });
  }
});


router.get("/meta/filters", async (req, res) => {
  try {
    const db = getDB();
    const categories = await db
      .collection("menuItems")
      .distinct("category", { status: "approved" });
    const locations = await db
      .collection("menuItems")
      .distinct("location", { status: "approved" });

    return res.json({
      success: true,
      categories: categories.filter(Boolean),
      locations: locations.filter(Boolean),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch filter metadata" });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid menu item ID" });
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

    let vendorInfo = null;
    if (item.vendorId && ObjectId.isValid(item.vendorId)) {
      vendorInfo = await db
        .collection("users")
        .findOne(
          { _id: new ObjectId(item.vendorId) },
          { projection: { password: 0 } }
        );
    }

    return res.json({
      success: true,
      data: {
        ...item,
        vendor: vendorInfo
          ? {
              id: vendorInfo._id,
              name: vendorInfo.name,
              businessName: vendorInfo.businessName || vendorInfo.name,
              email: vendorInfo.email,
              image: vendorInfo.image,
              isPremium: vendorInfo.subscriptionPlan === "premium",
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Fetch single item error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch menu item details" });
  }
});

module.exports = router;
export default router;
