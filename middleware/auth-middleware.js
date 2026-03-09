import jwt from "jsonwebtoken";
import User from "../models/user.js";

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized - No token" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized - Invalid token format" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ .lean() returns a plain JS object instead of a Mongoose document
    // This skips hydration overhead and is ~3x faster for simple reads
    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      return res.status(401).json({ message: "Unauthorized - User not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
  }
};

export default authMiddleware;