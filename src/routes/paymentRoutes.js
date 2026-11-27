import express from 'express';
import Stripe from 'stripe';
import 'dotenv/config'; 
import { ObjectId } from 'mongodb';
import { getDB } from '../config/db.js';
import { verifyToken, verifyRole } from '../middlewares/authMiddleware.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post(
  "/create-checkout-session",
  verifyToken,
  verifyRole(["vendor"]),
  async (req, res) => {
    try {
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      const vendor = req.user;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: vendor.email,
        client_reference_id: vendor.id,
        metadata: {
          vendorId: vendor.id,
          vendorEmail: vendor.email,
          vendorName: vendor.name,
          plan: "premium",
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "PizzaArea Vendor Premium Membership",
                description:
                  "Unlimited menu items, Featured placement on homepage, and Verified PRO badge.",
                images: [
                  "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80",
                ],
              },
              unit_amount: 1999,
            },
            quantity: 1,
          },
        ],
        success_url: `${clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/payment-cancel`,
      });

      return res.json({
        success: true,
        id: session.id,
        url: session.url, 
      });
    } catch (error) {
      console.error("Stripe session creation error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create payment checkout session",
      });
    }
  }
);


router.get("/verify-session", verifyToken, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res
        .status(400)
        .json({ success: false, message: "Session ID is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid") {
      const vendorId =
        session.metadata?.vendorId || session.client_reference_id;
      const db = getDB();

      const existingTx = await db
        .collection("transactions")
        .findOne({ stripeSessionId: session.id });

      if (!existingTx && vendorId) {
        const newTx = {
          vendorId,
          vendorEmail: session.metadata?.vendorEmail || session.customer_email,
          vendorName: session.metadata?.vendorName || "Vendor",
          plan: "premium",
          amount: (session.amount_total || 1999) / 100,
          currency: (session.currency || "usd").toUpperCase(),
          stripeSessionId: session.id,
          status: "succeeded",
          createdAt: new Date(),
        };
        await db.collection("transactions").insertOne(newTx);

        
        const userQuery = {
          $or: [
            { _id: vendorId },
            ...(ObjectId.isValid(vendorId) ? [{ _id: new ObjectId(vendorId) }] : [])
          ]
        };

        await db.collection("user").updateOne(userQuery, {
          $set: {
            subscriptionPlan: "premium",
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        });

        await db.collection("users").updateOne(userQuery, {
          $set: {
            subscriptionPlan: "premium",
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        });

        await db
          .collection("menuItems")
          .updateMany({ vendorId }, { $set: { isFeatured: true } });
      }

      return res.json({
        success: true,
        message:
          "Payment verified and Premium subscription activated successfully!",
        plan: "premium",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Payment has not been completed or verified",
    });
  } catch (error) {
    console.error("Verify session error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to verify payment session" });
  }
});


router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      }
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const vendorId =
        session.metadata?.vendorId || session.client_reference_id;

      try {
        const db = getDB();
        const existing = await db
          .collection("transactions")
          .findOne({ stripeSessionId: session.id });

        if (!existing && vendorId) {
          await db.collection("transactions").insertOne({
            vendorId,
            vendorEmail:
              session.metadata?.vendorEmail || session.customer_email,
            vendorName: session.metadata?.vendorName || "Vendor",
            plan: "premium",
            amount: (session.amount_total || 1999) / 100,
            currency: (session.currency || "usd").toUpperCase(),
            stripeSessionId: session.id,
            status: "succeeded",
            createdAt: new Date(),
          });

          const userQuery = {
            $or: [
              { _id: vendorId },
              ...(ObjectId.isValid(vendorId) ? [{ _id: new ObjectId(vendorId) }] : [])
            ]
          };

          await db.collection("user").updateOne(userQuery, {
            $set: {
              subscriptionPlan: "premium",
              subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            },
          });

          await db.collection("users").updateOne(userQuery, {
            $set: {
              subscriptionPlan: "premium",
              subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              updatedAt: new Date(),
            },
          });

          await db
            .collection("menuItems")
            .updateMany({ vendorId }, { $set: { isFeatured: true } });
        }
      } catch (dbErr) {
        console.error("Webhook DB error:", dbErr);
      }
    }

    return res.json({ received: true });
  }
);

export default router;