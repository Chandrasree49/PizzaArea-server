import express from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.put("/", verifyToken, async (req, res) => {
  try {
    const { name, image, businessName, role, subscriptionPlan, isBlocked } =
      req.body;

    if (role || subscriptionPlan || isBlocked !== undefined) {
      return res.status(403).json({
        success: false,
        message:
          "Forbidden: You cannot modify your role, subscription plan, or block status via profile updates.",
      });
    }

    if (!name || name.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Name cannot be empty" });
    }

    const db = getDB();
    const updateData = {
      name: name.trim(),
      updatedAt: new Date(),
    };

    if (image) updateData.image = image.trim();
    if (req.user.role === "vendor" && businessName) {
      updateData.businessName = businessName.trim();
    }

    await db
      .collection("users")
      .updateOne({ _id: new ObjectId(req.user.id) }, { $set: updateData });

    const updatedUser = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(req.user.id) },
        { projection: { password: 0 } }
      );

    return res.json({
      success: true,
      message: "Profile updated successfully!",
      user: {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        image: updatedUser.image,
        businessName: updatedUser.businessName || "",
        subscriptionPlan: updatedUser.subscriptionPlan || "free",
      },
    });
  } catch (error) {
    console.error("Profile update error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update profile" });
  }
});
export default router;
