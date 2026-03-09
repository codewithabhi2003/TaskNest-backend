import User from "../models/user.js";
import bcrypt from "bcrypt";

/* =========================
   GET USER PROFILE
========================= */
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   UPDATE USER PROFILE
   Accepts:
     - name: string
     - profilePicture: base64 data URL string (optional)
========================= */
const updateUserProfile = async (req, res) => {
  try {
    const { name, profilePicture } = req.body;

    const updateFields = { name };

    if (profilePicture !== undefined) {
      // Validate it's a real base64 image data URL
      if (
        profilePicture &&
        !profilePicture.startsWith("data:image/")
      ) {
        return res.status(400).json({ message: "Invalid image format" });
      }

      // Rough size guard — base64 inflates by ~33%, so 2 MB file ≈ 2.7 MB string
      const MAX_BYTES = 3 * 1024 * 1024; // 3 MB base64 string limit
      if (profilePicture && Buffer.byteLength(profilePicture, "utf8") > MAX_BYTES) {
        return res.status(400).json({ message: "Image too large. Maximum size is 2 MB." });
      }

      updateFields.profilePicture = profilePicture;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateFields,
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================
   CHANGE PASSWORD
========================= */
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) return res.status(403).json({ message: "Invalid old password" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export { getUserProfile, updateUserProfile, changePassword };